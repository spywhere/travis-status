const { URL } = require("url");
const querystring = require("querystring");

class API {
    constructor(host, data){
        this.host = host;
        this.data = data;
    }

    createURL(){
        let url = new URL(`https://${ this.host }`);
        return url;
    }

    repos(option) {
        let url = this.createURL();
        url.pathname = "/repos";
        url.search = querystring.stringify(option);
        return url;
    }

    broadcasts(option) {
        let url = this.createURL();
        url.pathname = "/broadcasts";
        url.search = querystring.stringify(option);
        return url;
    }

    repositoryBuilds(option) {
        let url = this.createURL();
        url.pathname = `${ this.data["@href"] }/builds`;
        url.search = querystring.stringify(option);
        return url;
    }
}


module.exports = (host, data) => new API(host, data);
