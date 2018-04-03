const fs = require("fs");
const svg2png = require("svg2png");

let graph = {
    total: 3,
    spacing: 1 / 32,
    height: 0.75,
    top: 0.75
};
let scales = [{
    size: 32,
    suffix: "@2x"
}, {
    size: 16,
    suffix: ""
}];

// default: "yellow" (cdb62c),
// passed: "green" (39aa56),
// failed: "red" (db4545),
// errored: "red" (db4545),
// canceled: "gray" (9d9d9d)
let states = ["default", "passed", "failed", "started"];
let color = {
    default: "#a2a2a2",
    passed: "#86c351",
    failed: "#eb3d00",
    started: "#f7ed00"
};

let spacingWidth = 32 * graph.spacing;
let barWidth = (32 - (graph.total - 1) * spacingWidth) / graph.total;
let barHeight = graph.height * 32;
let barTop = graph.height * 8;

let svgTemplate = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"`;
svgTemplate += ` width="32" height="32" viewBox="0 0 32 32">`;

for (let i = 0; i < graph.total; i++) {
    svgTemplate += `<rect x="${
        (i * (barWidth + spacingWidth))
    }" y="${
        barTop
    }" width="${
        barWidth
    }" height="${
        barHeight
    }" fill="color-${ i }" />`;
}

svgTemplate += "</svg>";

function* generate(){
    for (let state1 of states) {
        for (let state2 of states) {
            for (let state3 of states) {
                for (let scale of scales) {
                    let state = `${
                        state1.substr(0, 1)
                    }${
                        state2.substr(0, 1)
                    }${
                        state3.substr(0, 1)
                    }`;

                    let iconSvg = svgTemplate
                        .replace("color-0", color[state1])
                        .replace("color-1", color[state2])
                        .replace("color-2", color[state3]);

                    let object = {
                        state: state,
                        scale: scale,
                        png: svg2png(
                            new Buffer(iconSvg),
                            {
                                width: scale.size,
                                height: scale.size
                            }
                        )
                    };

                    yield object;
                };
            };
        };
    };

    return;
}

let images = generate();
let data = images.next();

function writeFile(data){
    if (data.done) {
        return;
    }
    let image = data.value;

    let filename = `output/build-icon-${
        image.state
    }${
        image.scale.suffix
    }.png`;

    console.log(
        `generating image for state ${ image.state }${ image.scale.suffix }...`
    );

    image.png.then((buffer) => {

        console.log(`writing to ${ filename }...`);

        fs.writeFileSync(filename, buffer);

        console.log("done");

        writeFile(images.next());
    });
}

writeFile(data);
