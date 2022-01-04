'use strict';

module.exports = index;

const path = require('path')

const semver = require('semver')
const colors = require('colors/safe')
const userHome = require('user-home')
const pathExists = require('path-exists').sync
const commander = require('commander')
const log = require("../../../@hedait-cli/log");

const fse = require('fs-extra');
// const exec = require('../../exec/lib/index')

const constant = require('./const')
const pkg = require('../package.json')

const program = new commander.Command()

async function index() {
    try {
        await prepare()
        registerCommand()
    } catch (e) {
        console.log(e.message)
    }

}

function registerCommand() {
    program
        .name(Object.keys(pkg.bin)[0])
        .usage('<command> [options]')
        .version(pkg.version)
        .option('-d, --debug', '是否开启调试模式', false)
        .option('-tp, --targetPath <targetPath>', '是否指定本地调试文件路径', '')

    program
        .command('init [projectName]')
        .option('-f, --force', '是否强制初始化项目')
        .action(function () {
            const args = Array.from(arguments)
            const cmd = args[args.length - 1]
            const o = Object.create(null)
            Object.keys(cmd).forEach(key => {
                if (
                    cmd.hasOwnProperty(key) &&
                    !key.startsWith('_') &&
                    key !== 'parent'
                ) {
                    o[key] = cmd[key]
                }
            })
            args[args.length - 1] = o
            require("../../../@hedait-cli/init");
(args)
        })

    program
        .command('set <paramName> <paramValue>')
        .action(function () {
            const args = Array.from(arguments)
            const cmd = args[args.length - 1]
            const o = Object.create(null)
            Object.keys(cmd).forEach(key => {
                if (
                    cmd.hasOwnProperty(key) &&
                    !key.startsWith('_') &&
                    key !== 'parent'
                ) {
                    o[key] = cmd[key]
                }
            })
            args[args.length - 1] = o
            require("../../../@hedait-cli/set");
(args)
        })

    program
        .command('get [paramName]')
        .action(function () {
            const args = Array.from(arguments)
            const cmd = args[args.length - 1]
            const o = Object.create(null)
            Object.keys(cmd).forEach(key => {
                if (
                    cmd.hasOwnProperty(key) &&
                    !key.startsWith('_') &&
                    key !== 'parent'
                ) {
                    o[key] = cmd[key]
                }
            })
            args[args.length - 1] = o
            require("../../../@hedait-cli/get");
(args)
        })

    program
        .command('add [componentName] [componentPath]')
        .action(function () {
            const args = Array.from(arguments)
            const cmd = args[args.length - 1]
            const o = Object.create(null)
            Object.keys(cmd).forEach(key => {
                if (
                    cmd.hasOwnProperty(key) &&
                    !key.startsWith('_') &&
                    key !== 'parent'
                ) {
                    o[key] = cmd[key]
                }
            })
            args[args.length - 1] = o
            require("../../../@hedait-cli/add");
(args)
        })

    program
        .command('reset')
        .action(function () {
            const args = Array.from(arguments)
            const cmd = args[args.length - 1]
            const o = Object.create(null)
            Object.keys(cmd).forEach(key => {
                if (
                    cmd.hasOwnProperty(key) &&
                    !key.startsWith('_') &&
                    key !== 'parent'
                ) {
                    o[key] = cmd[key]
                }
            })
            args[args.length - 1] = o
            require("../../../@hedait-cli/reset");
(args)
        })

    // 开启debug模式
    program.on('option:debug', function () {
        if (this.opts().debug) {
            process.env.LOG_LEVEL = 'verbose'
        } else {
            process.env.LOG_LEVEL = 'info'
        }
        log.level = process.env.LOG_LEVEL
    })

    // 指定targetPath
    program.on('option:targetPath', function () {
        process.env.CLI_TARGET_PATH = this.opts().targetPath
    })

    program.on('command:*', function (obj) {
        const availableCommands = program.commands.map(cmd => cmd.name())
        console.log(colors.red('未知的命令' + obj[0]))
        if (availableCommands.length > 0) {
            console.log(colors.red('可用命令' + availableCommands.join(',')))
        }
    })

    program.parse(process.argv)
    if (program.args && program.args.length < 1) {
        program.outputHelp()
    }


}

async function prepare() {
    checkPkgVersion()
    checkRoot()
    checkUserHome()
    await checkEnv()
    await checkGlobalUpdate()
}

// 检查全局更新
async function checkGlobalUpdate() {
    const currentVersion = pkg.version
    const npmName = pkg.name
    const {
        getNpmSemverVersion
    } = require("../../../@hedait-cli/get-npm-info");

    const lastVersion = await getNpmSemverVersion(npmName, currentVersion)
    if (lastVersion && semver.gt(lastVersion, currentVersion)) {
        log.warn('更新提示', colors.yellow(`请手动更新 ${npmName}, 当前版本 ${currentVersion}, 最新版本 ${lastVersion}
        更新命令：npm install -g ${npmName}`))
    }
}

// 读取主目录下的.env文件获取配置
async function checkEnv() {
    const dotenv = require('dotenv')
    const dotenvPath = path.resolve(userHome, '.hedait.env')
    if (!pathExists(dotenvPath)) {
        fse.copyFileSync(path.resolve(__dirname, '../../../assets/.env'), dotenvPath)
    }
    dotenv.config({
        path: dotenvPath
    })
    createDefaultConfig()
}

function createDefaultConfig() {
    const cliConfig = {
        home: userHome
    }
    if (process.env.CLI_HOME) {
        cliConfig['cliHome'] = path.join(userHome, process.env.CLI_HOME)
    } else {
        cliConfig['cliHome'] = path.join(userHome, constant.DEFAULT_CLI_HOME)
    }
    process.env.CLI_HOME_PATH = cliConfig.cliHome
}

// 获取用户主目录用于缓存
function checkUserHome() {
    if (!userHome || !pathExists(userHome)) {
        throw new Error(colors.red('当前登录用户主目录不存在'))
    }
}

// root用户降级，防止无权限操作
function checkRoot() {
    const rootCheck = require('root-check')
    rootCheck()
}

function checkPkgVersion() {
    log.notice('cli', pkg.version)
}
