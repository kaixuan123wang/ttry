'use strict';

module.exports = exec;

const path = require('path')
const log = require('../../../utils/log/lib/index')
const Package = require('../../../models/package/lib/index')
const { exec: spawn } = require('../../../utils/utils/lib/index')

const SETTINGS = {
    init: '@hedait-cli/init',
    set: '@hedait-cli/set',
    get: '@hedait-cli/get'
}

const CACHE_DIR = 'dependencies'

async function exec() {
    let targetPath = process.env.CLI_TARGET_PATH
    let storeDir = ''
    const homePath = process.env.CLI_HOME_PATH
    let pkg
    log.verbose('targetPath', targetPath)
    log.verbose('homePath', homePath)

    const cmdObj = arguments[arguments.length - 1]
    const cmdName = cmdObj.name()
    const packageName = SETTINGS[cmdName]
    const version = 'latest'

    if(!targetPath) {
        // 生成缓存路径
        targetPath = path.resolve(homePath, CACHE_DIR)
        storeDir = path.resolve(targetPath, 'node_modules')
        log.verbose('targetPath', targetPath)
        log.verbose('storePath', storeDir)
        pkg = new Package({
            targetPath,
            storeDir,
            cmdName,
            packageName,
            version
        })
        if(await pkg.exists()) {
            // 更新package
            await pkg.update()
        } else {
            // 安装package
            await pkg.install()
        }
    } else {
        pkg = new Package({
            targetPath,
            cmdName,
            packageName,
            version
        })
    }

    const rootFile = pkg.getRootFilePath()
    if(rootFile) {
        // spawn适合需要不断打印日志的命令，如npm i
        // exec/execFile开销小的任务
        try {
            const args = Array.from(arguments)
            const cmd = args[args.length - 1]
            const o = Object.create(null)
            Object.keys(cmd).forEach(key => {
                if(
                    cmd.hasOwnProperty(key) &&
                    !key.startsWith('_') &&
                    key !== 'parent'
                ) {
                    o[key] = cmd[key]
                }
            })
            args[args.length - 1] = o
            const code = `require('${rootFile}').call(null, ${JSON.stringify(args)})`
            const child = spawn('node', ['-e', code], {
                cwd: process.cwd(),
                stdio: 'inherit'
            })
            child.on('error', e => {
                log.error(e.message)
                process.exit(1)
            })
            child.on('exit', e => {
                log.verbose('命令执行成功：' + e)
                process.exit()
            })

        } catch (e) {
            log.error(e.message)
        }

    }
}
