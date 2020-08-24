const { default: fetch } = require("node-fetch")
const fs = require('fs');


class RemOnlineClient {
    constructor(apiKeyPath, apiTokenPath) {
        this._apiKeyPath = apiKeyPath;
        this._apiTokenPath = apiTokenPath
        this._apiKey = require(this._apiKeyPath).apiKey;
        this._token = require(this._apiTokenPath).token;
        this._baseUrl = 'https://api.remonline.ru/';
    }


    /**
     * @method _request for send requests to remonline api, put apiToken in request and refreshs him if it need
     * @param {Object} options object with options (method, methodsUrl, params, body, remArrValues) for request api
     * @param {String} options.method ("GET" | "POST" | "PATCH" etc...)
     * @param {String} options.methodsUrl url of api method ("orders/" | "branches/" etc...)
     * @param {Object} [options.remArrValues] object with url params {key: [values]} make string "key=value1&key-value2..."
     * @param {Object} [options.body] - object with post body
     * @param {Object} [options.params] - object with url params, make string "key1=value1&key2=value2" and concat to url
     * @returns {Object} object with response from remonline api
     */
    async _request({ method, methodsUrl, params = "", body = "", remArrValues = "" }) {
        let url = this._baseUrl + methodsUrl +
            `?token=${this._token}`;
        let paramsStr = "";
        if (params) {
            paramsStr = "&" + Object.entries(params)
                .map(([key, val] = v) => `${key}=${val}`)
                .join('&');

            url += paramsStr;
        }

        let remArrParams = "";
        if (remArrValues) {
            let [key, arr] = Object.entries(remArrValues)[0];
            remArrParams = "&" + arr.map(v => `${key}=${v}`).join('&');
            url += remArrParams;
        }

        let options = {
            method: method.toUpperCase(),
            headers: { "Content-Type": "application/json" },
        };

        if (body) options.body = JSON.stringify(body);

        let result = await fetch(encodeURI(url), options)
            .then(response => {
                return response.json()
            })

        if (result.success === false) {
            result = await this._refreshToken()
                .then(() => {
                    url = this._baseUrl + methodsUrl + `?token=${this._token}` + paramsStr + remArrParams;
                    console.log("ЕЩЕ РАЗ УРЛ", url);
                    console.log("ЕЩЕ РАЗ БОДИ", options);
                    return fetch(encodeURI(url), options)
                })
                .then(response => {
                    return response.json()
                })
                .catch(err => console.err(err))
        }
        return result
    }

    async _refreshToken() {
        console.log("Получение нового токена");
        await fetch(this._baseUrl + "token/new" + `?api_key=${this._apiKey}`, { method: "POST" })
            .then(response => response.json())
            .then(jsonResp => {
                if (!jsonResp.success) {
                    throw new Error(jsonResp)
                }
                return jsonResp.token;
            })
            .then(token => {
                try {
                    this._token = token;
                    fs.writeFileSync(this._apiTokenPath, JSON.stringify({ token: token }))
                } catch (err) {
                    throw err
                }
            })
            .catch(err => console.err(err))
        return this
    }


    /**@method getBranchesList() for get list of branches from remonline api
     * @returns {Array} array of branches in account
     * @example //get list of branches in account
     * const remo = new RemOnlineClient(__dirname + "//apiKey.json", __dirname + "//apiToken.json")
     * .getBranchesList()
     * .then(branchesList => console.log(branchesList))
     * .catch(err => console.log(err))
     */
    async getBranchesList() {
        let response = await this._request({
            method: "get",
            methodsUrl: "branches/"
        })
        return response.data
    }

    /**@method getOrdersById(...ids)
     * @param  {String|Number | [String|Number]} orderIds
     * @returns {Array} Array of orders (Promise)
     */
    async getOrdersById(...ids) {
        if (ids[0].length) ids = ids[0]
        let response = await this._request({
            method: "GET",
            methodsUrl: "order/",
            remArrValues: {
                "ids[]": ids,
            },
        })
        let orders = response.data;
        return orders
    }

    /**@method getStatuses() for get list of statuses in your account
     * @returns {Array} array with statuses (Promise)
     */
    async getStatuses() {
        let response = await this._request({
            method: "GET",
            methodsUrl: "statuses/",
        })
        return response.data
    }

    /**@method getClientByPhone(...phone) for get client with specified phone(s) (only first in list)
     * @param {String|Number} phone string or number, may be array of them for find client in remonline
     * @returns {Object|undefined} client (object), first client of list with specified phone (Promise)
     * if client not founded (or not exists) - returns undefined
     */
    async getClientByPhone(...phone) {
        if (Array.isArray(phone[0])) phone = phone[0]
        let contactData = await this._request({
            method: "GET",
            methodsUrl: "clients/",
            remArrValues: { "phones[]": phone },
        });
        return contactData.data[0]
    }

    /**@method createClient({ name, phone }) creating new client in remonline with specified name and phone
     * @param {String} client.name name of new client
     * @param {Number} client.phone phone number of new client
     * @returns {Number} clientId (Promise)
     */
    async createClient({ name, phone }) {
        return await this._request({
                method: "POST",
                methodsUrl: "clients/",
                body: {
                    name: name,
                    "phone[]": String(phone),
                },
                remArrValues: {
                    name: [name],
                    "phone[]": [String(phone)],
                }
            })
            .then(response => response.data.id)
            .catch(err => console.log(err))
    }

    /**@method createNewOrder(orderData) for create new order in remonline
     * @param {Object} orderData - read documentation for build this object: https://remonline.ru/docs/api/#apisection11_22
     * @returns {Number} newOrderId (Promise)
     */
    async createNewOrder(orderData) {
        let response = await this._request({
            method: "POST",
            methodsUrl: "order/",
            params: orderData,
            body: orderData
        })
        let order_id = response.data.id
        return order_id
    }
}

module.exports = RemOnlineClient