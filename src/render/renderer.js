import {
  CAMERA, POOL, SIM, SWELL_TIME_SCALE, THEMES, VIEW, WATER, WAVES,
} from '../config.js';
import { createGL, makeFloatTarget, program } from '../gl.js';
import { lookAt, multiply, norm, perspective } from '../math.js';
import { createGrid } from './mesh.js';
import { CAUSTIC_FS, CAUSTIC_VS, QUAD_VS, UI_GLASS_FS, UPDATE_FS, WATER_FS, WATER_VS } from './shaders.js';

function makeSceneTarget(gl, initialWidth, initialHeight) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const depth = gl.createRenderbuffer();
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);

  let width = 0;
  let height = 0;

  function resize(nextW, nextH) {
    const w = Math.max(1, Math.floor(nextW));
    const h = Math.max(1, Math.floor(nextH));
    if (w === width && h === height) return;
    width = w;
    height = h;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Scene reflection framebuffer is incomplete.');
    }
  }

  resize(initialWidth, initialHeight);
  return {
    tex,
    fb,
    resize,
    get width() { return width; },
    get height() { return height; },
  };
}

function cloneTheme(t) {
  return {
    sunDir: t.sunDir.slice(),
    sunColor: t.sunColor.slice(),
    sunIntensity: t.sunIntensity,
    tileDark: t.tileDark.slice(),
    tileMid: t.tileMid.slice(),
    tileBright: t.tileBright.slice(),
    groutCol: t.groutCol.slice(),
    skyDeep: t.skyDeep.slice(),
    skyMid: t.skyMid.slice(),
    skyBright: t.skyBright.slice(),
    causticTint: t.causticTint.slice(),
    shaftStrength: t.shaftStrength,
    biolum: t.biolum,
    nightGlow: t.nightGlow,
  };
}

function lerpVec3(cur, dst, k) {
  cur[0] += (dst[0] - cur[0]) * k;
  cur[1] += (dst[1] - cur[1]) * k;
  cur[2] += (dst[2] - cur[2]) * k;
}

function blendTheme(cur, dst, k) {
  lerpVec3(cur.sunDir, dst.sunDir, k);
  const u = norm(cur.sunDir);
  cur.sunDir[0] = u[0];
  cur.sunDir[1] = u[1];
  cur.sunDir[2] = u[2];
  lerpVec3(cur.sunColor, dst.sunColor, k);
  cur.sunIntensity += (dst.sunIntensity - cur.sunIntensity) * k;
  lerpVec3(cur.tileDark, dst.tileDark, k);
  lerpVec3(cur.tileMid, dst.tileMid, k);
  lerpVec3(cur.tileBright, dst.tileBright, k);
  lerpVec3(cur.groutCol, dst.groutCol, k);
  lerpVec3(cur.skyDeep, dst.skyDeep, k);
  lerpVec3(cur.skyMid, dst.skyMid, k);
  lerpVec3(cur.skyBright, dst.skyBright, k);
  lerpVec3(cur.causticTint, dst.causticTint, k);
  cur.shaftStrength += (dst.shaftStrength - cur.shaftStrength) * k;
  cur.biolum += (dst.biolum - cur.biolum) * k;
  cur.nightGlow += (dst.nightGlow - cur.nightGlow) * k;
}

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

  const linearFloat = Boolean(gl.getExtension('OES_texture_float_linear'));
  const caustic = makeFloatTarget(gl, VIEW.causticSize, linearFloat ? gl.LINEAR : gl.NEAREST);
  const causticProg = program(gl, CAUSTIC_VS, CAUSTIC_FS);

  const updateProg = program(gl, QUAD_VS, UPDATE_FS);
  const waterProg = program(gl, WATER_VS, WATER_FS);
  const uiGlassProg = program(gl, QUAD_VS, UI_GLASS_FS);
  const sceneTarget = makeSceneTarget(gl, canvas.width || 1, canvas.height || 1);
  let mvp = new Float32Array(16);

  function clearTarget(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.size, target.size);
    gl.clearColor(0, 0, 0, 0);
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

  const packedDrops = new Float32Array(SIM.maxDrops * 4);
  let targetTheme = THEMES.sunlit;
  const activeTheme = cloneTheme(targetTheme);

  return {
    setTheme(themeId) {
      if (THEMES[themeId]) targetTheme = THEMES[themeId];
    },
    getMvp() {
      return mvp;
    },
    step(drops) {
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
      const list = Array.isArray(drops) ? drops : (drops ? [drops] : []);
      let count = 0;
      for (let i = 0; i < list.length && count < SIM.maxDrops; i++) {
        const d = list[i];
        if (!d || d.strength === 0) continue;
        packedDrops[count * 4] = d.u;
        packedDrops[count * 4 + 1] = d.v;
        packedDrops[count * 4 + 2] = d.radius;
        packedDrops[count * 4 + 3] = d.strength;
        count += 1;
      }
      gl.uniform1i(gl.getUniformLocation(updateProg, 'u_dropCount'), count);
      if (count > 0) {
        gl.uniform4fv(gl.getUniformLocation(updateProg, 'u_drops'), packedDrops);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const swap = read;
      read = write;
      write = swap;
    },
    draw(timeSeconds, uiPills = null) {
      blendTheme(activeTheme, targetTheme, 0.08);
      sceneTarget.resize(canvas.width, canvas.height);

      gl.bindFramebuffer(gl.FRAMEBUFFER, caustic.fb);
      gl.viewport(0, 0, caustic.size, caustic.size);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(causticProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      const causticLoc = gl.getAttribLocation(causticProg, 'a_xz');
      gl.enableVertexAttribArray(causticLoc);
      gl.vertexAttribPointer(causticLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(gl.getUniformLocation(causticProg, 'u_sim'), 0);
      gl.uniform1f(gl.getUniformLocation(causticProg, 'u_time'), timeSeconds * SWELL_TIME_SCALE);
      gl.uniform1f(gl.getUniformLocation(causticProg, 'u_half'), POOL.halfExtent);
      gl.uniform1f(gl.getUniformLocation(causticProg, 'u_texel'), 1 / SIM.size);
      gl.uniform1f(gl.getUniformLocation(causticProg, 'u_worldDx'), (2 * POOL.halfExtent) / SIM.size);
      gl.uniform1f(gl.getUniformLocation(causticProg, 'u_floorY'), POOL.floorY);
      gl.uniform1f(gl.getUniformLocation(causticProg, 'u_ior'), WATER.ior);
      gl.uniform3fv(gl.getUniformLocation(causticProg, 'u_sunDir'), activeTheme.sunDir);
      gl.uniform3fv(gl.getUniformLocation(causticProg, 'u_absorption'), WATER.absorption);
      uploadWaves(gl, causticProg);
      gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fb);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(activeTheme.skyDeep[0], activeTheme.skyDeep[1], activeTheme.skyDeep[2], 1);
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
      gl.bindTexture(gl.TEXTURE_2D, caustic.tex);
      gl.uniform1i(gl.getUniformLocation(waterProg, 'u_caustic'), 1);
      gl.uniformMatrix4fv(gl.getUniformLocation(waterProg, 'u_mvp'), false, mvp);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_time'), timeSeconds * SWELL_TIME_SCALE);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_half'), POOL.halfExtent);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_texel'), 1 / SIM.size);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_worldDx'), (2 * POOL.halfExtent) / SIM.size);
      uploadWaves(gl, waterProg);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_camera'), CAMERA.eye);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_sunDir'), activeTheme.sunDir);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_sunColor'), activeTheme.sunColor);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_sunIntensity'), activeTheme.sunIntensity);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_floorY'), POOL.floorY);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_f0'), WATER.f0);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_ior'), WATER.ior);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_absorption'), WATER.absorption);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_tileDark'), activeTheme.tileDark);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_tileMid'), activeTheme.tileMid);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_tileBright'), activeTheme.tileBright);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_groutCol'), activeTheme.groutCol);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_skyDeep'), activeTheme.skyDeep);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_skyMid'), activeTheme.skyMid);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_skyBright'), activeTheme.skyBright);
      gl.uniform3fv(gl.getUniformLocation(waterProg, 'u_causticTint'), activeTheme.causticTint);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_shaftStrength'), activeTheme.shaftStrength);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_biolum'), activeTheme.biolum);
      gl.uniform1f(gl.getUniformLocation(waterProg, 'u_nightGlow'), activeTheme.nightGlow);
      gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(uiGlassProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      const uiLoc = gl.getAttribLocation(uiGlassProg, 'a_position');
      gl.enableVertexAttribArray(uiLoc);
      gl.vertexAttribPointer(uiLoc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTarget.tex);
      gl.uniform1i(gl.getUniformLocation(uiGlassProg, 'u_scene'), 0);
      gl.uniform2f(gl.getUniformLocation(uiGlassProg, 'u_resolution'), canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(uiGlassProg, 'u_time'), timeSeconds * SWELL_TIME_SCALE);
      const uiCount = uiPills && uiPills.count > 0 ? uiPills.count : 0;
      gl.uniform1i(gl.getUniformLocation(uiGlassProg, 'u_uiCount'), uiCount);
      if (uiCount > 0) {
        gl.uniform4fv(gl.getUniformLocation(uiGlassProg, 'u_uiRects'), uiPills.rects);
        gl.uniform4fv(gl.getUniformLocation(uiGlassProg, 'u_uiMeta'), uiPills.meta);
      }
      gl.uniform3fv(gl.getUniformLocation(uiGlassProg, 'u_sunDir'), activeTheme.sunDir);
      gl.uniform3fv(gl.getUniformLocation(uiGlassProg, 'u_sunColor'), activeTheme.sunColor);
      gl.uniform3fv(gl.getUniformLocation(uiGlassProg, 'u_skyDeep'), activeTheme.skyDeep);
      gl.uniform3fv(gl.getUniformLocation(uiGlassProg, 'u_skyMid'), activeTheme.skyMid);
      gl.uniform3fv(gl.getUniformLocation(uiGlassProg, 'u_skyBright'), activeTheme.skyBright);
      gl.uniform3fv(gl.getUniformLocation(uiGlassProg, 'u_causticTint'), activeTheme.causticTint);
      gl.uniform1f(gl.getUniformLocation(uiGlassProg, 'u_biolum'), activeTheme.biolum);
      gl.uniform1f(gl.getUniformLocation(uiGlassProg, 'u_nightGlow'), activeTheme.nightGlow);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    resize() {
      rebuildCamera();
      sceneTarget.resize(canvas.width, canvas.height);
    },
  };
}
