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

const config = require('../../../config');
const controller = require('../../controller');
const utils = require('../utils');

/**
 * http://yargs.js.org/docs/#methods-commandmodule-providing-a-command-module
 */
exports.command = 'status';
exports.describe = 'Reports the current status of the emulator.';

exports.builder = {};

/**
 * Handler for the "clear" command.
 */
exports.handler = () => {
  controller.status((err, status, env) => {
    if (err) {
      utils.writer.error(err);
      return;
    }

    utils.writer.write(utils.APP_NAME + 'is ');

    if (status === controller.RUNNING) {
      utils.writer.write('RUNNING'.green);
      utils.writer.write(' on port ' + config.port);

      if (env) {
        if (env.inspect && (env.inspect === 'true' || env.inspect === true)) {
          utils.writer.write(', with ' + 'INSPECT'.yellow + ' enabled on port ' + (config.debugPort || 9229));
        } else if (env.debug && (env.debug === 'true' || env.debug === true)) {
          utils.writer.write(', with ' + 'DEBUG'.yellow + ' enabled on port ' + (config.debugPort || 5858));
        }
      }

      utils.writer.write('\n');
    } else {
      utils.writer.write('STOPPED\n'.red);
    }
  });
};
