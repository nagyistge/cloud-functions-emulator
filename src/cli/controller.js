/**
 * Copyright 2016, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const TIMEOUT_POLL_INCREMENT = 500;
const got = require('got');
const path = require('path');
const net = require('net');
const spawn = require('child_process').spawn;
const config = require('../../config');
const logs = require('../logs');
const fs = require('fs');
const PID_PATH = path.join(__dirname, 'process.pid');
const EMULATOR_ROOT_URI = `http://localhost:${config.get('port')}`;
const EMULATOR_FUNC_URI = `${EMULATOR_ROOT_URI}/function/`;

const STATE = {
  STOPPED: 0,
  RUNNING: 1
};

class Controller {
  constructor () {
    this.STATE = STATE;
  }

  /**
   * Starts the emulator process
   *
   * @param {object} opts Configuration options.
   * @param {string} opts.projectId The Cloud Platform project ID to bind to this emulator instance
   * @param {boolean} opts.debug If true, start the spawned node process with --debug
   * @param {boolean} opts.inspect If true, start the spawned node process with --inspect
   */
  start (opts) {
    return Promise.resolve()
      .then(() => {
        // Project ID is optional, but any function that needs to authenticate to
        // a Google API will require a valid project ID
        // The authentication against the project is handled by the gcloud-node
        // module which leverages the Cloud SDK (gcloud) as the authentication basis.
        if (!opts.projectId) {
          opts.projectId = config.get('projectId');
        }

        // Starting the emulator amounts to spawning a child node process.
        // The child process will be detached so we don't hold an open socket
        // in the console. The detached process runs an HTTP server (ExpressJS).
        // Communication to the detached process is then done via HTTP
        const args = ['.', config.get('port'), opts.projectId];

        // We will pipe stdout from the child process to the emulator log file
        const logFilePath = path.resolve(logs.assertLogsPath(), config.get('logFileName'));

        // TODO:
        // For some bizzare reason boolean values in the environment of the
        // child process return as Strings in JSON documents sent over HTTP with
        // a content-type of application/json, so we need to check for String
        // 'true' as well as boolean.
        if (opts.inspect === true || opts.inspect === 'true') {
          const semver = process.version.split('.');
          const major = parseInt(semver[0].substring(1, semver[0].length));
          if (major >= 6) {
            args.unshift('--inspect');
            console.log('Starting in inspect mode.  Check ' + logFilePath + ' for details on how to connect to the chrome debugger');
          } else {
            console.error('--inspect flag requires Node 6+');
          }
        } else if (opts.debug === true || opts.debug === 'true') {
          if (config.get('debugPort')) {
            args.unshift('--debug=' + config.get('debugPort'));
          } else {
            args.unshift('--debug');
          }
          console.log('Starting in debug mode.  Debugger listening on port ' + (config.get('debugPort') ? config.get('debugPort') : 5858));
        }

        // Pass the debug flag to the environment of the child process so we can
        // query it later.  This is used during restart operations where we don't
        // want the user to have to remember all the startup arguments
        // TODO: This will become unwieldy if we add more startup arguments
        const env = process.env;
        env.DEBUG = opts.debug;
        env.INSPECT = opts.inspect;

        // Make sure the child is detached, otherwise it will be bound to the
        // lifecycle of the parent process.  This means we should also ignore
        // the binding of stdout.
        const out = fs.openSync(logFilePath, 'a');
        const child = spawn('node', args, {
          cwd: path.join(__dirname, '../..'),
          detached: true,
          stdio: ['ignore', out, out],
          env: env
        });

        // Write the pid to the file system in case we need to kill it later
        // This can be done by the user in the 'kill' command
        this._writePID(child.pid);

        // Ensure the parent doesn't wait for the child to exit
        // This should be used in combination with the 'detached' property
        // of the spawn() options.  The node documentation is unclear about
        // the behavior of detached & unref on different platforms.  'detached'
        // on Windows seems to do the same thing as unref() on non-Windows
        // platforms.  Doing both seems like the safest approach.
        // TODO: Test on Windows
        child.unref();

        // Ensure the service has started before we notify the caller.
        return this._waitForStart(config.get('port'), config.get('timeout'));
      });
  }

  /**
   * Notify the Emulator that it needs to stop and give it a chance to stop
   * gracfully. After a timeout, kill the process.
   */
  stop () {
    return this._action({ method: 'DELETE', url: EMULATOR_ROOT_URI, timeout: 5000 })
      .then(() => this._waitForStop(config.get('port'), config.get('timeout')))
      .then(() => this.kill(), () => this.kill());
  }

  /**
   * Kills the emulator process by sending a SIGTERM to the child process
   */
  kill () {
    return Promise.resolve(PID_PATH)
      .then((path) => {
        const pid = parseInt(fs.readFileSync(path), 10);
        process.kill(pid);
        this._deletePID();
      })
      .catch(() => this._deletePID());
  }

  /**
   * Removes (undeploys) any functions deployed to this emulator
   */
  clear () {
    return this._action({ method: 'DELETE', url: EMULATOR_FUNC_URI });
  }

  /**
   * Removes (undeploys) any functions that no longer exist in their corresponding module
   */
  prune () {
    return this._action({ method: 'PATCH', url: EMULATOR_FUNC_URI });
  }

  /**
   * Checks the status of the child process' service
   */
  status () {
    return this.testConnection()
      .then(() => {
        return this.getCurrentEnvironment()
          .then((env) => {
            return { state: STATE.RUNNING, metadata: env };
          });
      }, (err) => {
        return { state: STATE.STOPPED, error: err };
      });
  }

  /**
   * Writes lines from the emulator log file to the given writer in FIFO order.
   * Lines are taken from the end of the file according to the limit argument.
   * That is, when limit is 10 will return the last (most recent) 10 lines from
   * the log (or fewer if there are fewer than 10 lines in the log), in the order
   * they were written to the log.
   *
   * @param {Object} writer The output writer onto which log lines will be written.
                            Should be an object that exposes a single 'write(String)' method
   * @param {integer} limit The maximum number of lines to write
   */
  getLogs (writer, limit) {
    if (!limit) {
      limit = 20;
    }

    const logFile = path.join(logs.assertLogsPath(), config.get('logFileName'));

    logs.readLogLines(logFile, limit, (val) => {
      writer.write(val);
    });
  }

  /**
   * Deploys a function to the emulator.
   *
   * @param {String}  modulePath The local file system path (rel or abs) to the
   *                  Node module containing the function to be deployed
   * @param {String}  entryPoint The (case sensitive) name of the function to
   *                  be deployed.  This must be a function that is exported
   *                  from the host module
   * @param {String}  type One of 'H' (HTTP) or 'B' (BACKGROUND).  This
   *                  corresponds to the method used to invoke the function
   *                  (HTTP or direct invocation with a context argument)
   */
  deploy (modulePath, entryPoint, type) {
    const url = `${EMULATOR_FUNC_URI}${entryPoint}?path=${path.resolve(modulePath)}&type=${type}`;
    return this._action({ method: 'POST', url });
  }

  /**
   * Removes a previously deployed function from the emulator.
   */
  undeploy (name) {
    return this._action({ method: 'DELETE', url: `${EMULATOR_FUNC_URI}${name}` });
  }

  /**
   * Returns a JSON document containing all deployed functions including any
   * metadata that was associated with the function at deploy time.
   */
  list () {
    return this._action(EMULATOR_FUNC_URI);
  }

  /**
   * Describes a single function deployed to the emulator. This includes the
   * function name and associated metadata.
   *
   * @param {string} name The case sensitive name of the function to describe.
   */
  describe (name) {
    return this._action(`${EMULATOR_FUNC_URI}${name}`);
  }

  /**
   * Causes the function denoted by the given name to be invoked with the given
   * data payload.  If the function is a BACKGROUND function, this will invoke
   * the function directly with the data argument.  If the function is an HTTP
   * function this will perform an HTTP POST with the data argument as the POST
   * body.
   *
   * @param {string} name The (case sensitive) name of the function to be invoked
   * @param {object} data A JSON document representing the function invocation payload
   */
  call (name, data = {}) {
    return this._action({ method: 'POST', url: `${EMULATOR_ROOT_URI}/${name}`, data, raw: true });
  }

  /**
   * Returns the current environment of the child process.  This includes the
   * GCP project used when starting the child process, and whether the process
   * is running in debug mode.
   */
  getCurrentEnvironment () {
    return this._action({
      url: `${EMULATOR_ROOT_URI}/?env=true`,
      timeout: 2000
    });
  }

  _waitForStop (port, timeout, i) {
    if (!i) {
      i = timeout / TIMEOUT_POLL_INCREMENT;
    }

    return this.testConnection()
      .then(() => {
        i--;

        if (i <= 0) {
          throw new Error('Timeout waiting for emulator stop');
        }

        return new Promise((resolve, reject) => {
          setTimeout(() => {
            this._waitForStop(port, timeout, i).then(resolve, reject);
          }, TIMEOUT_POLL_INCREMENT);
        });
      }, () => {});
  }

  _waitForStart (port, timeout, i) {
    if (!i) {
      i = timeout / TIMEOUT_POLL_INCREMENT;
    }

    return this.testConnection()
      .catch(() => {
        i--;

        if (i <= 0) {
          throw new Error('Timeout waiting for emulator start'.red);
        }

        return new Promise((resolve, reject) => {
          setTimeout(() => {
            this._waitForStart(port, timeout, i).then(resolve, reject);
          }, TIMEOUT_POLL_INCREMENT);
        });
      });
  }

  testConnection () {
    return new Promise((resolve, reject) => {
      const client = net.connect(config.get('port'), config.get('host'), () => {
        client.end();
        resolve();
      });
      client.on('error', reject);
    });
  }

  _action (opts = {}) {
    if (typeof opts === 'string') {
      opts = {
        url: opts
      };
    }
    opts.method || (opts.method = 'GET');
    opts.json = true;

    if (opts.method === 'POST' && opts.data) {
      if (opts.data.toString() === '[object String]' || typeof opts.data === 'string') {
        opts.json = JSON.parse(opts.data);
      } else {
        // Assume object
        opts.json = opts.data;
      }
    }

    let raw = opts.raw;
    delete opts.raw;

    return got(opts.url, opts).then((response) => raw ? response : response.body);
  }

  _writePID (pid) {
    // Write the pid to the file system in case we need to kill it
    return new Promise((resolve) => {
      // Ignore any error
      fs.writeFile(PID_PATH, pid, () => resolve());
    });
  }

  _deletePID () {
    return new Promise((resolve) => {
      // Ignore any error
      fs.unlink(PID_PATH, () => resolve());
    });
  }
}

module.exports = new Controller();
module.exports.Controller = Controller;

