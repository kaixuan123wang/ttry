'use strict';

const path = require('path');
const userHome = require('user-home');
const fse = require('fs-extra');
const dotenv = require('dotenv');
const { Table, printTable } = require('console-table-printer');
const log = require("../../../@hedait-cli/log/lib");
const Command = require("../../../@hedait-cli/command/lib");

class GetCommand extends Command {
    init() {
        this.configEnv = path.resolve(userHome, '.hedait.env');
        // 确保配置文件存在
        fse.ensureFile(this.configEnv);

        this.paramName = this._argv[0];
    }

    exec() {
        const envs = dotenv.config({
            path: this.configEnv
        }).parsed

        if(!this.paramName) {
            const table = new Table
            for(let env in envs) {
                table.addRow({
                    name: env,
                    value: envs[env]
                })
            }
            table.printTable();
            return
        }

        if(envs[this.paramName]) {
            printTable([{name: this.paramName, value: envs[this.paramName]}])
        } else {
            log.error('未定义此环境变量')
        }
    }
}

function init(argv) {
    return new GetCommand(argv)
}

module.exports = init
module.exports.GetCommand = GetCommand
