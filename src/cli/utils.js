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

const Table = require('cli-table2');

const controller = require('../controller');

const APP_NAME = exports.APP_NAME = 'Google Cloud Functions Emulator ';

const writer = exports.writer = {
  log (...args) {
    console.log(...args);
  },
  error (...args) {
    console.error(...args);
  },
  write (...args) {
    console._stdout.write(...args);
  }
};

exports.printDescribe = (body) => {
  body = JSON.parse(body);

  const table = new Table({
    head: ['Property'.cyan, 'Value'.cyan],
    colWidths: [10, 70]
  });

  table.push(['Name', body.name.white]);
  table.push(['Type', body.type.white]);
  table.push(['Path', body.path.white]);

  if (body.url) {
    table.push(['Url', body.url.white]);
  }
  writer.log(table.toString());
};

exports.doIfRunning = (fn) => {
  controller.status((err, status) => {
    if (err) {
      writer.error(err);
      return;
    }

    if (status === controller.RUNNING) {
      fn();
    } else {
      writer.write((`${APP_NAME}is not running. Use "functions start" to start the emulator\n`).cyan);
    }
  });
};
