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

const controller = require('../controller');
const start = require('./start').handler;
const stop = require('./stop').handler;
const utils = require('../utils');

/**
 * http://yargs.js.org/docs/#methods-commandmodule-providing-a-command-module
 */
exports.command = 'restart';
exports.describe = 'Restarts the emulator.';

exports.builder = {};

/**
 * Handler for the "restart" command.
 */
exports.handler = (opts = {}) => {
  return controller.status()
    .then((status) => {
      if (status.state === controller.STATE.RUNNING) {
        return stop()
          .then(() => start(Object.assign(opts, status.metadata)));
      } else {
        return start(opts);
      }
    })
    .catch(utils.handleError);
};
