const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const rootDirectory = path.dirname(__dirname);
const getFile = (...paths) => path.join(rootDirectory, ...paths);
const filePath = path.join(app.getPath("userData"), "settings.json");
const logFilePath = path.join(app.getPath("userData"), "logs");

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

function writeLog(msg){
    fs.appendFileSync(
        logFilePath, msg
    );
}

module.exports = {
    load: loadConfigurations,
    save: saveConfigurations,
    log: writeLog,
    file: getFile,
    view: (file) => getFile("renderer", file + ".html"),
    image: (file) => getFile("images", file + ".png")
};
