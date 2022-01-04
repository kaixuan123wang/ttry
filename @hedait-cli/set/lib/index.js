'use strict';

const path = require('path');
const userHome = require('user-home');
const fse = require('fs-extra');
const dotenv = require('dotenv');
const log = require("../../../@hedait-cli/log");

const Command = require("../../../@hedait-cli/command");


const PARAMS = [
    'BASE_URL', // 访问接口地址
    'PROJECT_TEMPLATE', // 获取模板列表的地址
    'COMPONENT' // 获取组件列表地址
]

class SetCommand extends Command {
    init() {
        this.configEnv = path.resolve(userHome, '.hedait.env');
        // 确保配置文件存在
        fse.ensureFile(this.configEnv);

        this.paramName = this._argv[0];
        this.paramValue = this._argv[1];
    }
    exec() {
        if(!PARAMS.includes(this.paramName)) {
            log.error('此变量不在变量配置列表中');
            return
        }
        // 获取env文件
        const envs = dotenv.config({
            path: this.configEnv
        }).parsed
        // 读写
        if(this.paramName && this.paramValue) {
            envs[this.paramName] = this.paramValue
            let text = ''
            for(let env in envs) {
                text += `${env}=${envs[env]} \n`
            }
            fse.writeFile(this.configEnv, text, (err) => {
                if(err) {
                    throw err
                }

                log.success('环境变量设置成功')
            })
        }
    }
}


function init(argv) {
    return new SetCommand(argv)
}

module.exports = init
module.exports.SetCommand = SetCommand
