const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const rootDirectory = __dirname;
const getFile = (...paths) => path.join(rootDirectory, ...paths);
const filePath = path.join(app.getPath("userData"), "settings.json");

function loadConfigurations(){
    try {
        return JSON.parse(fs.readFileSync(
            filePath
        ));
    } catch (error) {
        return {};
    }
}

function saveConfigurations(config){
    fs.writeFileSync(
        filePath, JSON.stringify(config, undefined, 2)
    );
}

module.exports = {
    load: loadConfigurations,
    save: saveConfigurations,
    file: getFile,
    view: (file) => getFile("renderer", file + ".html"),
    image: (file) => getFile("images", file + ".png")
};
