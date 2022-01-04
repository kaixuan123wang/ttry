'use strict';

const path = require("path");
const fse = require('fs-extra')
const pkgDir = require('pkg-dir').sync
const pathExists = require('path-exists').sync
const npminstall = require('npminstall')

const {
  isObject
} = require("../../../@hedait-cli/utils");

const formatPath = require("../../../@hedait-cli/format-path");

const {
  getDefaultRegistry,
  getNpmLatestVersion
} = require("../../../@hedait-cli/get-npm-info");
;


class Package {
  constructor(options) {
    if (!options) {
      throw new Error('Package类的options参数不能为空')
    }
    if (!isObject(options)) {
      throw new Error('Package类的options参数必需是一个对象')
    }
    // package的路径
    this.targetPath = options.targetPath
    // 缓存package的路径
    this.storeDir = options.storeDir
    // package的name
    this.packageName = options.packageName
    // package的version
    this.packageVersion = options.version
    // package的缓存目录前缀
    this.cacheFilePathPrefix = this.packageName.replace('/', '_')
  }

  async prepare() {
    if (this.mode === 'git') {
      return
    }
    if (this.storeDir && !pathExists(this.storeDir)) {
      fse.mkdirpSync(this.storeDir);
    }
    if (this.packageVersion === 'latest') {
      this.packageVersion = await getNpmLatestVersion(this.packageName)
    }
  }

  get cacheFilePath() {
    return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`)
  }
  getSpecificCacheFilePath(packageVersion) {
    return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${packageVersion || ''}@${this.packageName}`)
  }

  // 判断当前package是否存在
  async exists() {
    if (this.storeDir) {
      await this.prepare()
      return pathExists(this.cacheFilePath)
    } else {
      return pathExists(this.targetPath)
    }
  }

  // 安装package
  async install(mode = 'npm') {
    if (mode === 'npm') {
      return this.install_npm()
    } else {
      return this.install_git()
    }
  }

  async install_git() {
    const urllib = require('urllib');
    // 下载指定git压缩包
    const url = `${process.env.BASE_URL}/api/v4/projects/${this.packageName}/repository/archive.zip`
    return urllib.request(url, {
      options: {
        Headers: {
          "content-Disposition": "attachment;filename=${.temporary.zip}"
        }
      },
      streaming: true,
      followRedirect: true,
    })
    // .then(result => {
    //   compressing.zip.uncompress(result.res, this.storeDir)
    // })
  }

  async install_npm() {
    await this.prepare()
    return npminstall({
      root: this.targetPath,
      storeDir: this.storeDir,
      registry: getDefaultRegistry(),
      pkgs: [{
        name: this.packageName,
        version: this.packageVersion
      }]
    }).catch(e => {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(e)
      }
    })
  }

  // 更新package
  async update() {
    await this.prepare()
    // 获取最新npm模块版本号
    const latestPackageVersion = await getNpmLatestVersion(this.packageName)
    // 查询最新版本号对应的路径是否存在
    const latestFilePath = this.getSpecificCacheFilePath(latestPackageVersion)
    // 如果不存在则安装新版本
    if (!pathExists(latestFilePath)) {
      await npminstall({
        root: this.targetPath,
        storeDir: this.storeDir,
        registry: getDefaultRegistry(),
        pkgs: [{
          name: this.packageName,
          version: latestPackageVersion
        }]
      })
      this.packageVersion = latestPackageVersion
    } else {
      this.packageVersion = latestPackageVersion
    }

  }

  // 获取入口文件路径
  getRootFilePath() {
    function _getRooteFile(targetPath) {
      const dir = pkgDir(targetPath)
      if (dir) {
        const pkgFile = require(path.resolve(dir, 'package.json'))
        if (pkgFile && pkgFile.main) {
          return formatPath(path.resolve(dir, pkgFile.main))
        }
      }
    }
    if (this.storeDir) {
      return _getRooteFile(this.cacheFilePath)
    } else {
      return _getRooteFile(this.targetPath)
    }

    return null
  }
}

module.exports = Package
