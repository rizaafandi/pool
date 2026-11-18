import {
  CAMERA, POOL, SIM, SUN_COLOR, SUN_DIR, SUN_INTENSITY, VIEW, WATER, WAVES,
} from '../config.js';
import { createGL, makeFloatTarget, program } from '../gl.js';
import { lookAt, multiply, perspective } from '../math.js';
import { createGrid } from './mesh.js';
import { QUAD_VS, UPDATE_FS, WATER_FS, WATER_VS } from './shaders.js';

function uploadWaves(gl, prog) {
  const packed = new Float32Array(16);
  const phases = new Float32Array(4);
  for (let i = 0; i < WAVES.length; i++) {
    packed[i * 4] = WAVES[i].dirX;
    packed[i * 4 + 1] = WAVES[i].dirZ;
    packed[i * 4 + 2] = WAVES[i].wavelength;
    packed[i * 4 + 3] = WAVES[i].steepness;
    phases[i] = WAVES[i].phase;
  }
  gl.uniform1i(gl.getUniformLocation(prog, 'u_waveCount'), WAVES.length);
  gl.uniform4fv(gl.getUniformLocation(prog, 'u_waves'), packed);
  gl.uniform1fv(gl.getUniformLocation(prog, 'u_phases'), phases);
}

export function createRenderer(canvas) {
  const gl = createGL(canvas);
  let read = makeFloatTarget(gl, SIM.size, gl.NEAREST);
  let write = makeFloatTarget(gl, SIM.size, gl.NEAREST);
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const grid = createGrid(VIEW.meshSegments, POOL.halfExtent);
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, grid.positions, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.indices, gl.STATIC_DRAW);

  const fill = new Uint8Array([140, 140, 140, 255]);
  const flatLight = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, flatLight);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, fill);

  const updateProg = program(gl, QUAD_VS, UPDATE_FS);
  const waterProg = program(gl, WATER_VS, WATER_FS);
  let mvp = new Float32Array(16);

  function clearTarget(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.size, target.size);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  clearTarget(read);
  clearTarget(write);

  function rebuildCamera() {
    const aspect = canvas.width / canvas.height;
    const view = lookAt(CAMERA.eye, CAMERA.target, [0, 1, 0]);
    const proj = perspective(CAMERA.fovY, aspect, CAMERA.near, CAMERA.far);
    mvp = multiply(proj, view);
  }
  rebuildCamera();

  return {
    step(drop) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
      gl.viewport(0, 0, SIM.size, SIM.size);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(updateProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      const loc = gl.getAttribLocation(updateProg, 'a_position');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(updateProg, 'u_state'), 0);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_waveSpeed'), SIM.waveSpeed);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_damping'), SIM.damping);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_texel'), 1 / SIM.size);
      const active = drop && drop.strength !== 0;
      gl.uniform2f(gl.getUniformLocation(updateProg, 'u_dropCenter'), active ? drop.u : 0, active ? drop.v : 0);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropRadius'), active ? drop.radius : 1);
      gl.uniform1f(gl.getUniformLocation(updateProg, 'u_dropStrength'), active ? drop.strength : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const swap = read;
      read = write;
      write = swap;
    },
    draw(timeSeconds) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.02, 0.15, 0.28, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(waterProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      const loc = gl.getAttribLocation(waterProg, 'a_xz');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(waterProg, 'u_sim'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, flatLight);
      gl.uniform1i(gl.getUniformLocation(waterProg, 'u_caustic'), 1);
      gl.uniformMatrix4fv(gl.getUniformLocation(waterProg, 'u_mvp'), false, mvp);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_time'), timeSeconds);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_half'), POOL.halfExtent);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_texel'), 1 / SIM.size);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_worldDx'), (2 * POOL.halfExtent) / SIM.size);
      uploadWaves(gl, waterProg);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_camera'), CAMERA.eye);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_sunDir'), SUN_DIR);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_sunColor'), SUN_COLOR);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_sunIntensity'), SUN_INTENSITY);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_floorY'), POOL.floorY);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_f0'), WATER.f0);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_ior'), WATER.ior);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_absorption'), WATER.absorption);
      gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);
    },
    resize() {
      rebuildCamera();
    },
  };
}
