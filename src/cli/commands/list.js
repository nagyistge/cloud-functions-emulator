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

const fs = require('fs');
const Table = require('cli-table2');

const controller = require('../../controller');
const utils = require('../utils');

function pathExists (p) {
  try {
    fs.statSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * http://yargs.js.org/docs/#methods-commandmodule-providing-a-command-module
 */
exports.command = 'list';
exports.describe = 'Lists deployed functions.';

exports.builder = {};

/**
 * Handler for the "list" command.
 */
exports.handler = () => {
  utils.doIfRunning(() => {
    controller.list((err, body) => {
      if (err) {
        utils.writer.error(err);
        return;
      }

      var table = new Table({
        head: ['Name'.cyan, 'Type'.cyan, 'Path'.cyan],
        colWidths: [15, 12, 52]
      });

      var type, path;
      var count = 0;

      for (var func in body) {
        type = body[func].type;
        path = body[func].path;

        if (pathExists(path)) {
          table.push([
            func.white,
            type.white,
            path.white
          ]);
        } else {
          table.push([
            func.white,
            type.white,
            path.red
          ]);
        }

        count++;
      }

      if (count === 0) {
        table.push([{
          colSpan: 3,
          content: "No functions deployed ¯\\_(ツ)_/¯.  Run 'functions deploy' to deploy a function"
            .gray
        }]);
      }

      var output = table.toString();

      utils.writer.log(output);
    });
  });
};
