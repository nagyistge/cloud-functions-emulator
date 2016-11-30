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

var config = require('../../../config.js');
const controller = require('../../controller');
const list = require('./list');
const utils = require('../utils');

/**
 * http://yargs.js.org/docs/#methods-commandmodule-providing-a-command-module
 */
exports.command = 'start';
exports.describe = 'Starts the emulator.';

exports.builder = {
  debug: {
    alias: 'd',
    default: false,
    description: 'Start the emulator in debug mode.',
    type: 'boolean',
    requiresArg: false
  },
  inspect: {
    alias: 'i',
    default: false,
    description: 'Experimental! (Node 7+ only).  Pass the --inspect flag to Node',
    type: 'boolean',
    requiresArg: false
  },
  projectId: {
    alias: 'p',
    default: process.env.GCLOUD_PROJECT,
    description: 'Your Google Cloud Platform project ID.',
    type: 'string',
    requiresArg: true
  }
};

/**
 * Handler for the "clear" command.
 */
exports.handler = (opts) => {
  var projectId;
  if (opts && opts.projectId) {
    projectId = opts.projectId;
  }

  var debug = (opts && opts.debug) || false;
  var inspect = (opts && opts.inspect) || false;

  utils.writer.log('Starting ' + utils.APP_NAME + 'on port ' + config.port + '...');

  controller.start(projectId, debug, inspect, function (err, status) {
    if (err) {
      utils.writer.error(err);
      return;
    }

    if (status === controller.ALREADY_RUNNING) {
      utils.writer.log(utils.APP_NAME + 'already running'.cyan);
    } else {
      utils.writer.write(utils.APP_NAME);
      utils.writer.write('STARTED\n'.green);
    }

    list();
  });
};
