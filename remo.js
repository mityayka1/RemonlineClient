const { default: fetch } = require("node-fetch")
const fs = require('fs');

/**@class RemOnlineClient*/
class RemOnlineClient {
    /**@constructor
     * @param {String} apiKeyPath - path to file .JSON with apiKey in JSON ({"apiKey": "xxxxxx"})
     * @param {String} apiTokenPath - path to file .JSON where will be stored apiToken (will be create automatically in specified adress)
     */
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
    async _request({ method, methodsUrl, params = {}, body = "", remArrValues = []}) {
        
        let url = `${this._baseUrl}${methodsUrl}?token=${this._token}`;
        
        let resultParams = {};
        // формируем общий массив параметров для запроса
        Object.assign(resultParams, params, remArrValues[0]);
        
        let paramsStr = Object.entries(resultParams).map(([key, val] = el) => `${key}=${val}`).join('&');
        if(paramsStr) url = `${url}&${paramsStr}`;

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

    /**@method getOrdersById(ids)
     * @param  {String|Number} orderIds may be Array of them
     * @returns {Array} Array of orders (Promise)
     * @example //get order from Remonline by id
     * const Remo = new RemOnlineClient(__dirname + "//apiKey.json", __dirname + "//apiToken.json")
     * .getOrdersById(7777777)
     * .then(ArrayWithOrder => console.log(ArrayWithOrder))
     * .catch(err => console.log(err))
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
     * @example //get list of statuses in account
     * const remo = new RemOnlineClient(__dirname + "//apiKey.json", __dirname + "//apiToken.json")
     * .getStatuses()
     * .then(arrayWithStatuses => console.log(arrayWithStatuses))
     * .catch(err => console.log(err))
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
     * @example //get first client in founded list (find by phone number)
     * const remo = new RemOnlineClient(__dirname + "//apiKey.json", __dirname + "//apiToken.json")
     * .getClientByPhone(79157877757) // or "+79157877757" or other variants
     * .then(client => console.log(client))
     * .catch(err => console.log(err))
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

    /**@method createClient(options) creating new client in remonline with specified name and phone
     * @param {String} client.name name of new client
     * @param {Number} client.phone phone number of new client
     * @returns {Number} clientId (Promise)
     * @example //create new client in remonline with specified name and phone
     * const remo = new RemOnlineClient(__dirname + "//apiKey.json", __dirname + "//apiToken.json")
     * .createClient({name: "Vasya", phone: 79157877757})
     * .then(newClientId => console.log(newClientId))
     * .catch(err => console.log(err))
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
     * @example //create new order in remonline in specified branch
     * const remo = new RemOnlineClient(__dirname + "//apiKey.json", __dirname + "//apiToken.json")
     * 
     * let orderData = {
     *branch_id: 21464, //id of branch in remonline
     *order_type: 36099, //id of order type
     *kindof_good: 'iPhone', //type of good (String)
     *model: 'test-test-test', // name of goods model (String)
     *malfunction: 'Description', //description of malfunction (String)
     *estimated_cost: '1500', 
     *manager_notes: 'notes from manager'
     *}
     * remo.createNewOrder({orderData})
     * .then(newOrderId => console.log(newOrderId))
     * .catch(err => console.log(err))
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
