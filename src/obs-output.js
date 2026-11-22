const output = document.getElementById('output');
const context = output.getContext('2d', { alpha: true });

function draw() {
    const source = window.opener?.document?.getElementById('webgl-canvas');
    if (source && source.width && source.height) {
        if (output.width !== source.width || output.height !== source.height) {
            output.width = source.width;
            output.height = source.height;
        }
        context.clearRect(0, 0, output.width, output.height);
        context.drawImage(source, 0, 0);
    }
    requestAnimationFrame(draw);
}
draw();
