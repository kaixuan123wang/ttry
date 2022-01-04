'use strict';

const path = require('path');
const fse = require('fs-extra');
const log = require("../../../@hedait-cli/log/lib");
const glob = require('glob');
const Command = require("../../../@hedait-cli/command/lib");
const inquirer = require('inquirer');
const download = require('download-git-repo');
const formatPath = require("../../../@hedait-cli/format-path/lib")

const getComponentTemplate = require('./getComponentTemplate')

const {
    execAsync
} = require("../../../@hedait-cli/utils/lib")

const DEFAULT_PATH = 'src/mini_components'
class AddCommand extends Command {
    init() {
        // 当前目录
        this.componentName = this._argv[0]
        this.targetPath = this._argv[1] && path.resolve(process.cwd(), this._argv[1])
    }

    async exec() {
        try {
            await this.prepare()
            await this.downloadComponent()
            await this.installComponent()
        } catch (e) {
            log.error(e.message)
        }
    }

    async prepare() {
        // 获取所有模板
        const template = await getComponentTemplate()
        console.log(template)
        if (!template || template.length === 0) {
            throw new Error('项目模板不存在')
        }
        this.template = template
        if (this.componentName) {
            const templateInfo = template.find(t => t.name === this.componentName)
            if (templateInfo) {
                this.templateInfo = templateInfo
            } else {
                throw new Error('未找到指定模板')
            }
        } else {
            // 展示全部模板列表进行选择
            const componentName = (await inquirer.prompt({
                type: 'list',
                name: 'componentName',
                message: `请选择组件`,
                choices: this.createTemplates()
            })).componentName

            this.componentName = componentName
            const templateInfo = template.find(t => t.name === componentName)
            this.templateInfo = templateInfo
        }
        if (!this.targetPath) {
            const targtePath = (await inquirer.prompt({
                type: 'input',
                name: 'targtePath',
                message: '请输入包安装位置',
                default: DEFAULT_PATH
            })).targtePath
            this.targetPath = targtePath
        }
        // 判断是否与项目已有文件是否冲突
        const componentPath = path.resolve(this.targetPath, this.componentName)
        const isExits = fse.existsSync(componentPath)
        if (isExits) {
            throw new Error('当前组件已存在: ' + componentPath)
        }
        this.componentPath = componentPath
    }

    async downloadComponent() {
        // 指定的缓存文件夹加当前时间理论上不可能存在相同目录
        const temporaryDir = path.resolve(this.targetPath, `.temporary-${new Date().getTime()}`)
        this.temporaryDir = temporaryDir

        await new Promise((resolve, reject) => {
            download(this.templateInfo.npmName, temporaryDir, (err) => {
                if (err) {
                    reject(err)
                }
                resolve()
            })
        })
        log.success('安装下载成功!')
    }
    async installComponent() {
        if (this.templateInfo.type === 'normal') {
            this.installComponent_normal()
        } else if (this.templateInfo.type === 'custom') {
            this.installComponent_custom()
        }

    }

    async installComponent_normal() {
        fse.ensureDirSync(this.componentPath)
        fse.copySync(this.temporaryDir, this.componentPath)
        fse.removeSync(this.temporaryDir)
        log.success('组件添加成功')
    }

    async installComponent_custom() {
        // 判断是否自带node_modules文件夹,如果自带则不用执行 npm install
        if (!fse.existsSync(path.join(this.temporaryDir, 'node_modules'))) {
            await execAsync('pnpm', ['install'], {
                stdio: 'inherit',
                cwd: this.temporaryDir
            })
        }
        const pkgFile = require(path.join(this.temporaryDir, 'package.json'))
        const main = pkgFile.main
        const rootFile = formatPath(path.join(this.temporaryDir, main))
        const options = {
            templateInfo: this.templateInfo,
            sourcePath: path.join(this.temporaryDir, 'template'),
            targetPath: this.targetPath
        }
        const code = `require('${rootFile}')(${JSON.stringify(options)})`
        log.verbose('code', code)
        await execAsync('node', ['-e', code], {
            stdio: 'inherit',
            cwd: this.temporaryDir
        })
        fse.removeSync(this.temporaryDir)
        log.success('安装成功')
    }



    // 格式化模板数据
    createTemplates() {
        return this.template.map(item => ({
            value: item.name,
            name: item.name
        }))
    }
}

function init(argv) {
    return new AddCommand(argv)
}

module.exports = init
module.exports.AddCommand = AddCommand
