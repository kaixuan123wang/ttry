'use strict';

const request = require("../../../@hedait-cli/request/lib");

module.exports = function () {
    return request({
        url: process.env.COMPONENT_TEMPLATE || '/wangyanjun/hedait-create-options/raw/master/component.json'
    });
}
