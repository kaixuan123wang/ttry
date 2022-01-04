'use strict';

const dotenv = require('dotenv');
const userHome = require('user-home');
const request = require("../../../@hedait-cli/request/lib");

module.exports = function () {
    return request({
        url: process.env.PROJECT_TEMPLATE || '/wangyanjun/hedait-create-options/raw/master/project.json'
    });
}
