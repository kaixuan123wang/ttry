'use strict';

const fs = require('fs')
const path = require('path')
const inquirer = require('inquirer')
const fse = require('fs-extra')
const ejs = require('ejs')
const glob = require('glob')
const semver = require('semver')
const userHome = require('user-home')
const download = require('download-git-repo')

const log = require("../../../@hedait-cli/log");

const Command = require("../../../@hedait-cli/command");

const Package = require("../../../@hedait-cli/package");

const formatPath = require("../../../@hedait-cli/format-path");

const {
  spinnerStart,
  execAsync
} = require("../../../@hedait-cli/utils");


const getProjectTemplate = require('./getProjectTemplate')

const TYPE_PROJECT = 'project'
const TYPE_COMPONENT = 'component'

const TEMPLATE_TYPE_NORMAL = 'normal'
const TEMPLATE_TYPE_CUSTOM = 'custom'

const WHITE_COMMAND = ['npm', 'cnpm']

class InitCommand extends Command {
  init() {
    this.projectName = this._argv[0] || ''
    this.force = !!this._argv[1].force
    log.verbose('projectName', this.projectName)
    log.verbose('force', this)
  }

  async exec() {
    try {
      // 1. 准备阶段
      const projectInfo = await this.prepare()
      if (projectInfo) {
        log.verbose('projectInfo', projectInfo)
        this.projectInfo = projectInfo
        if (projectInfo.type === TYPE_PROJECT) {
          // 2.下载模板
          await this.downloadTemplate()
          // 3. 安装模板
          await this.installTemplate()
        } else if (projectInfo.type === TYPE_COMPONENT) {
          await this.downloadComponent()
          await this.installComponent()
        }


      }


    } catch (e) {
      log.error(e.message)
    }

  }

  // 安装模板
  async installTemplate() {
    const _nextCommand = () => {
      console.log('Done. Now run:')
      console.log(`  cd ${this.projectInfo.name}`);
      console.log('  npm install');
      console.log('  npm run dev');
    }

    if (this.templateInfo) {
      if (!this.templateInfo.type) {
        this.templateInfo.type = TEMPLATE_TYPE_NORMAL
      }
      if (this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
        // 标准安装
        await this.installNormalTemplate()
        _nextCommand()
      } else if (this.templateInfo.type === TEMPLATE_TYPE_CUSTOM) {
        // 自定义安装
        await this.installCustomTemplate()
        _nextCommand()
      } else {
        throw new Error('项目模板类型无法识别')
      }
    } else {
      throw new Error('项目模板不存在')
    }
  }

  // 检查自动执行的命令是否在白名单中
  checkCommand(cmd) {
    if (WHITE_COMMAND.includes(cmd)) {
      return cmd
    }
    return null
  }

  // 自动执行命令
  async execCommand(command, errorMsg) {
    let ret
    if (command) {
      const cmdArray = command.split(' ')
      const cmd = this.checkCommand(cmdArray[0])
      if (!cmd) {
        throw new Error('命令不存在: ' + cmd)
      }
      const args = cmdArray.slice(1)
      ret = await execAsync(cmd, args, {
        stdio: 'inherit',
        cwd: process.cwd()
      })
    }
    if (ret !== 0) {
      throw new Error(errorMsg)
    }

  }

  // ejs渲染
  async ejsRender(options) {
    const dir = path.resolve(process.cwd(), this.projectInfo.name)
    const projectInfo = this.projectInfo
    return new Promise((resolve, reject) => {
      glob('**', {
        cwd: dir,
        ignore: options.ignore || [],
        nodir: true
      }, (err, files) => {
        if (err) {
          reject(err)
        }
        Promise.all(files.map(file => {
          const filePath = path.join(dir, file)
          return new Promise((resolve1, reject1) => {
            ejs.renderFile(filePath, projectInfo, {}, (err, result) => {
              if (err) {
                reject1(err)
              } else {
                fse.writeFileSync(filePath, result)
                resolve1(result)
              }
            })
          })
        })).then(() => {
          resolve()
        }).catch(e => {
          reject(e)
        })
      })
    })
  }

  // 常规模式安装模板
  async installNormalTemplate() {
    // 拷贝模板代码至当前目录
    let spinner = spinnerStart('正在安装模板...')
    try {
      const targetPath = path.resolve(process.cwd(), this.projectInfo.name)
      fse.ensureDirSync(targetPath)
      if (this.templateInfo.isGit) {
        fse.copySync(this.temporaryDir, targetPath)
        fse.removeSync(this.temporaryDir)
      } else {
        const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template')
        fse.ensureDirSync(templatePath)
        fse.copySync(templatePath, targetPath)
      }

    } catch (e) {
      throw e
    } finally {
      spinner.stop(true)
      log.success('模板安装成功')
    }
    const templateIgnore = this.templateInfo.ignore || []
    const ignore = ['**/node_modules/**', ...templateIgnore]
    await this.ejsRender({
      ignore
    })
    // // 依赖安装
    // const {
    //   installCommand,
    //   startCommand
    // } = this.templateInfo
    // await this.execCommand(installCommand, '依赖安装过程失败')
    // // 启动命令执行
    // await this.execCommand(startCommand, '启动项目过程失败')
  }

  // 自定义安装模板
  async installCustomTemplate() {
    if (this.templateInfo.isGit) {
      // 判断是否自带node_modules文件夹,如果自带则不用执行 npm install
      if (!fs.existsSync(path.join(this.temporaryDir, 'node_modules'))) {
        await execAsync('pnpm', ['install'], {
          stdio: 'inherit',
          cwd: this.temporaryDir
        })
      }
      // 查找主文件
      const pkgFile = require(path.join(this.temporaryDir, 'package.json'))
      const main = pkgFile.main
      const rootFile = formatPath(path.join(this.temporaryDir, main))
      const options = {
        templateInfo: this.templateInfo,
        projectInfo: this.projectInfo,
        sourcePath: path.join(this.temporaryDir, 'template'),
        targetPath: path.resolve(process.cwd(), this.projectInfo.name)
      }
      console.log(options)
      const code = `require('${rootFile}')(${JSON.stringify(options)})`
      log.verbose('code', code)
      await execAsync('node', ['-e', code], {
        stdio: 'inherit',
        cwd: this.temporaryDir
      })
      fse.removeSync(this.temporaryDir)
      log.success('自定义模板安装成功')
    } else {
      if (await this.templateNpm.exists()) {
        const rootFile = this.templateNpm.getRootFilePath()
        if (fs.existsSync(rootFile)) {
          log.notice('开始执行自定义模板')
          const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template')
          const options = {
            templateInfo: this.templateInfo,
            projectInfo: this.projectInfo,
            sourcePath: templatePath,
            targetPath: process.cwd()
          }
          const code = `require('${rootFile}')(${JSON.stringify(options)})`
          log.verbose('code', code)
          await execAsync('node', ['-e', code], {
            stdio: 'inherit',
            cwd: process.cwd()
          })
          log.success('自定义模板安装成功')
        } else {

        }
      }
    }

  }

  // 下载模板
  async downloadTemplate() {
    const {
      projectTemplate
    } = this.projectInfo
    const templateInfo = this.template.find(item => item.npmName === projectTemplate)
    const targetPath = path.resolve(userHome, '.hedait-cli', 'template')
    const storeDir = path.resolve(userHome, '.hedait-cli', 'template', 'node_modules')
    const {
      npmName,
      version
    } = templateInfo
    this.templateInfo = templateInfo
    const templateNpm = new Package({
      targetPath,
      storeDir,
      packageName: npmName,
      version
    })
    if (templateInfo.isGit) {
      await this.downloadTemplate_git(templateNpm)
    } else {
      await this.downloadTemplate_npm(templateNpm)
    }
  }

  // 下载npm模板
  async downloadTemplate_npm(templateNpm) {
    if (!await templateNpm.exists()) {
      const spinner = spinnerStart('正在下载模板... ')
      try {
        await templateNpm.install()
      } catch (e) {
        throw e
      } finally {
        spinner.stop(true)
        if (await templateNpm.exists()) {
          log.success('下载模板成功')
          this.templateNpm = templateNpm
        }
      }
    } else {
      const spinner = spinnerStart('正在更新模板... ')
      try {
        await templateNpm.update()
      } catch (e) {
        throw e
      } finally {
        spinner.stop(true)
        if (await templateNpm.exists()) {
          log.success('更新模板成功')
          this.templateNpm = templateNpm
        }
      }
    }
  }

  // 下载git模板
  async downloadTemplate_git(templateNpm) {
    // 直接下载无本地缓存
    // let result = await templateNpm.install('git')
    const targetPath = path.resolve(process.cwd(), this.projectInfo.name)
    // 指定的缓存文件夹加当前时间理论上不可能存在相同目录
    const temporaryDir = path.resolve(targetPath, `.temporary-${new Date().getTime()}`)
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
    // fse.ensureDirSync(targetPath)
    // await compressing.zip.uncompress(result.res, temporaryDir)
    // const resDir = fs.readdirSync(temporaryDir)[0]
    // fse.copySync(path.resolve(temporaryDir, resDir), targetPath)
    // fse.removeSync(temporaryDir)

  }

  // 共同问题统计
  async prepare() {
    // 0. 判断项目模板是否存在
    const template = await getProjectTemplate()
    if (!template || template.length === 0) {
      throw new Error('项目模板不存在')
    }
    this.template = template
    if (this.projectName) {
      // 1. 判断当前目录是否为空
      const localPath = path.resolve(process.cwd(), this.projectName)
      fse.ensureDirSync(localPath)
      if (!this.isDirEmpty(localPath)) {
        let ifContinue = false
        if (!this.force) {
          // 1.1 询问是否继续创建
          ifContinue = (await inquirer.prompt({
            type: 'confirm',
            name: 'ifContinue',
            default: false,
            message: '当前文件夹不为空，是否继续创建项目'
          })).ifContinue
          if (!ifContinue) {
            return
          }
        }

        if (ifContinue || this.force) {
          // 用户二次确认
          const {
            confirmDelete
          } = await inquirer.prompt({
            type: 'confirm',
            name: 'confirmDelete',
            default: false,
            message: '是否确认清空当前目录下的文件?'
          })
          if (confirmDelete) {
            // 清空当前目录
            fse.emptyDirSync(localPath)
          }
        }
      }
    }


    return this.getProjectInfo()


  }

  // 项目信息问题统计
  async getProjectInfo(v) {
    function isValidName() {
      return /^[a-zA-Z]+([-][a-zA-Z][a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])*$/.test(v)
    }
    let projectInfo = {}
    let isProjectNameValid = false
    if (this.projectName && isValidName(this.projectName)) {
      isProjectNameValid = true
      projectInfo.projectName = this.projectName
    }

    // 1. 选择创建项目或组件
    const {
      type
    } = await inquirer.prompt({
      type: 'list',
      name: 'type',
      message: '请选择初始化类型',
      default: TYPE_PROJECT,
      choices: [{
          name: '项目',
          value: TYPE_PROJECT
        },
        {
          name: '组件',
          value: TYPE_COMPONENT
        }
      ]
    })
    log.verbose('type', type)
    const title = type === TYPE_PROJECT ? '项目' : '组件'
    this.template = this.template.filter(template => template.tag.includes(type))
    if (type === TYPE_COMPONENT) {

    }
    // 2. 获取项目的基本信息
    const projectNamePrompt = {
      type: 'input',
      name: 'projectName',
      message: `请输入${title}名称`,
      default: '',
      validate: function (v) {

        const done = this.async()

        setTimeout(function () {
          if (!isValidName(v) || v === '') {
            done(`请输入合法的${title}名称`)
            return
          }

          done(null, true)
        }, 0)
        // 1. 首字符必须为英文字符
        // 2. 尾字符必须为英文或数字，不能为字符
        // 3. 字符仅允许"-_"
      },
      filter: function (v) {
        return v
      }
    }
    // 填写版本信息
    const projectVersionPrompt = {
      type: 'input',
      name: 'projectVersion',
      message: `请输入${title}版本号`,
      default: '1.0.0',
      validate: function (v) {
        const done = this.async()

        setTimeout(function () {
          if (!(!!semver.valid(v))) {
            done('请输入正确版本号: x.x.x')
            return
          }
          done(null, true)
        }, 0)
      },
      filter: function (v) {
        if (!!semver.valid(v)) {
          return semver.valid(v)
        } else {
          return v
        }
      }
    }
    const projectPrompt = []
    if (type === TYPE_PROJECT) {
      if (!isProjectNameValid) {
        projectPrompt.push(projectNamePrompt)
      }
      projectPrompt.push(projectVersionPrompt)
    }
    projectPrompt.push({
      type: 'list',
      name: 'projectTemplate',
      message: `请选择${title}模板`,
      choices: this.createTemplates()
    })
    const project = await inquirer.prompt(projectPrompt)
    projectInfo = {
      ...projectInfo,
      type,
      ...project
    }

    if (projectInfo.projectName) {
      projectInfo.name = projectInfo.projectName
      projectInfo.className = require('kebab-case')(projectInfo.projectName).replace(/^-/, '')
    }
    if (projectInfo.projectVersion) {
      projectInfo.version = projectInfo.projectVersion
    }
    if (projectInfo.componentDescription) {
      projectInfo.description = projectInfo.componentDescription
    }

    return projectInfo
  }

  // 判断目录是否为空
  isDirEmpty(localPath) {

    let fileList = fs.readdirSync(localPath)
    fileList = fileList.filter(file => (
      !file.startsWith('.') && ['node_modules'].indexOf(file) < 0
    ))
    return !fileList || fileList.length <= 0
  }

  // 格式化模板数据
  createTemplates() {
    return this.template.map(item => ({
      value: item.npmName,
      name: item.name
    }))
  }


  // 组件部分
  async downloadComponent() {
    const {
      projectTemplate
    } = this.projectInfo
    this.templateInfo = this.template.find(item => item.npmName === projectTemplate)
    // TODO 判断是npm还是git,当前npm逻辑没写
    await this.downloadComponent_git()
  }
  async downloadComponent_git() {
    const targetPath = process.cwd()
    // 指定的缓存文件夹加当前时间理论上不可能存在相同目录
    const temporaryDir = path.resolve(targetPath, `.temporary-${new Date().getTime()}`)
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
    if (this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
      return this.installNormalComponent()
    } else if (this.templateInfo.type === TEMPLATE_TYPE_CUSTOM) {
      return this.installCustomComponent()
    }
  }
  async installNormalComponent() {
    return new Promise((resolve, reject) => {
      glob('**', {
        cwd: this.temporaryDir,
        nodir: true,
        dot:true
      }, (err, files) => {
        if (err) {
          reject(err)
        }
        const res = files.find(file => fs.existsSync(path.resolve(process.cwd(), file)))
        if(res) {
          reject(new Error('当前目录存在冲突文件' + res))
          return
        }
        // 执行迁移
        fse.copySync(this.temporaryDir, process.cwd())
        fse.removeSync(this.temporaryDir)
        log.success('组件安装成功')
        resolve()
      })
    })
  }
  async installCustomComponent() {
    const pkgFile = require(path.join(this.temporaryDir, 'package.json'))
    const main = pkgFile.main
    const rootFile = formatPath(path.join(this.temporaryDir, main))
    const options = {
      templateInfo: this.templateInfo,
      projectInfo: this.projectInfo,
      sourcePath: path.join(this.temporaryDir, 'template'),
      targetPath: process.cwd()
    }
    const code = `require('${rootFile}')(${JSON.stringify(options)})`
    log.verbose('code', code)
    await execAsync('node', ['-e', code], {
      stdio: 'inherit',
      cwd: this.temporaryDir
    })
    fse.removeSync(this.temporaryDir)
    log.success('组件安装成功')
  }
}

function init(argv) {
  return new InitCommand(argv)
}

module.exports = init
module.exports.InitCommand = InitCommand
