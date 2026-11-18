import { SIM } from '../config.js';
import { createGL, makeFloatTarget, program } from '../gl.js';
import { DEBUG_FS, QUAD_VS, UPDATE_FS } from './shaders.js';

function quad(gl) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  return buffer;
}

export function createRenderer(canvas) {
  const gl = createGL(canvas);
  const nearest = gl.NEAREST;
  let read = makeFloatTarget(gl, SIM.size, nearest);
  let write = makeFloatTarget(gl, SIM.size, nearest);
  const positions = quad(gl);
  const updateProg = program(gl, QUAD_VS, UPDATE_FS);
  const debugProg = program(gl, QUAD_VS, DEBUG_FS);

  function clearTarget(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.size, target.size);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  clearTarget(read);
  clearTarget(write);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  function bindQuad(prog) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    const loc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  return {
    step(drop) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
      gl.viewport(0, 0, SIM.size, SIM.size);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      bindQuad(updateProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(updateProg, 'u_state'), 0);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_waveSpeed'), SIM.waveSpeed);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_damping'), SIM.damping);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_texel'), 1 / SIM.size);
      const active = drop && drop.strength !== 0;
      gl.uniform2f(
        gl.getUniformLocation(updateProg, 'u_dropCenter'),
        active ? drop.u : 0,
        active ? drop.v : 0,
      );
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropRadius'), active ? drop.radius : 1);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropStrength'), active ? drop.strength : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const swap = read;
      read = write;
      write = swap;
    },
    draw() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.DEPTH_TEST);
      bindQuad(debugProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(debugProg, 'u_state'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    resize() {},
  };
}