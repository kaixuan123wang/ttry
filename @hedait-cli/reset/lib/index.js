const path = require('path');
const userHome = require('user-home');
const fse = require('fs-extra');
const Command = require("../../../@hedait-cli/command/lib");
const log = require("../../../@hedait-cli/log/lib");

class ResetCommand extends Command {
    init() {

    }

    exec() {
        const targetPath = path.resolve(userHome, '.hedait.env')
        fse.copyFileSync(path.resolve(__dirname, '../../../assets/.env'), targetPath)
        log.success('初始化成功', this._argv)
    }
}

function init(argv) {
    return new ResetCommand(argv)
}

module.exports = init
module.exports.ResetCommand = ResetCommand
