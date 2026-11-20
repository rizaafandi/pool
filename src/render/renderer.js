import {
  CAMERA, POOL, POOL_BEDS, SIM, SWELL_TIME_SCALE, THEMES, VIEW, WATER, WATER_CONDITIONS, WAVES,
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
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
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

function packWaves() {
  const packed = new Float32Array(16);
  const phases = new Float32Array(4);
  for (let i = 0; i < WAVES.length; i++) {
    packed[i * 4] = WAVES[i].dirX;
    packed[i * 4 + 1] = WAVES[i].dirZ;
    packed[i * 4 + 2] = WAVES[i].wavelength;
    packed[i * 4 + 3] = WAVES[i].steepness;
    phases[i] = WAVES[i].phase;
  }
  return { packed, phases };
}

function resolveUniforms(gl, prog, names) {
  const out = {};
  for (const name of names) {
    out[name] = gl.getUniformLocation(prog, name);
  }
  return out;
}

function makeArrayVao(gl, loc, arrayBuffer, elementBuffer = null) {
  if (typeof gl.createVertexArray !== 'function') return null;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
  if (loc >= 0) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  if (elementBuffer) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
  }
  gl.bindVertexArray(null);
  return vao;
}

function bindGeometry(gl, vao, loc, arrayBuffer, elementBuffer = null) {
  if (vao) {
    gl.bindVertexArray(vao);
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
  if (loc >= 0) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  if (elementBuffer) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
  }
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

  // Cache attribute locations, VAOs, uniform locations, and static uniform values once at init.
  const { packed: packedWaves, phases: packedPhases } = packWaves();
  const texel = 1 / SIM.size;
  const worldDx = (2 * POOL.halfExtent) / SIM.size;

  const updatePosLoc = gl.getAttribLocation(updateProg, 'a_position');
  const causticPosLoc = gl.getAttribLocation(causticProg, 'a_xz');
  const waterPosLoc = gl.getAttribLocation(waterProg, 'a_xz');
  const uiPosLoc = gl.getAttribLocation(uiGlassProg, 'a_position');

  const updateVao = makeArrayVao(gl, updatePosLoc, quadBuffer);
  const causticVao = makeArrayVao(gl, causticPosLoc, posBuffer, indexBuffer);
  const waterVao = makeArrayVao(gl, waterPosLoc, posBuffer, indexBuffer);
  const uiGlassVao = makeArrayVao(gl, uiPosLoc, quadBuffer);

  const updateU = resolveUniforms(gl, updateProg, [
    'u_state', 'u_waveSpeed', 'u_damping', 'u_texel', 'u_dropCount', 'u_drops',
  ]);
  gl.useProgram(updateProg);
  gl.uniform1i(updateU.u_state, 0);
  gl.uniform1f(updateU.u_texel, texel);

  const causticU = resolveUniforms(gl, causticProg, [
    'u_sim', 'u_time', 'u_half', 'u_texel', 'u_worldDx', 'u_floorY', 'u_ior',
    'u_sunDir', 'u_absorption', 'u_swellScale', 'u_waveCount', 'u_waves', 'u_phases',
  ]);
  gl.useProgram(causticProg);
  gl.uniform1i(causticU.u_sim, 0);
  gl.uniform1f(causticU.u_half, POOL.halfExtent);
  gl.uniform1f(causticU.u_texel, texel);
  gl.uniform1f(causticU.u_worldDx, worldDx);
  gl.uniform1f(causticU.u_floorY, POOL.floorY);
  gl.uniform1f(causticU.u_ior, WATER.ior);
  gl.uniform3fv(causticU.u_absorption, WATER.absorption);
  gl.uniform1i(causticU.u_waveCount, WAVES.length);
  gl.uniform4fv(causticU.u_waves, packedWaves);
  gl.uniform1fv(causticU.u_phases, packedPhases);

  const waterU = resolveUniforms(gl, waterProg, [
    'u_sim', 'u_caustic', 'u_mvp', 'u_time', 'u_half', 'u_texel', 'u_worldDx',
    'u_swellScale', 'u_waveCount', 'u_waves', 'u_phases',
    'u_camera', 'u_sunDir', 'u_sunColor', 'u_sunIntensity',
    'u_floorY', 'u_f0', 'u_ior', 'u_absorption',
    'u_tileDark', 'u_tileMid', 'u_tileBright', 'u_groutCol',
    'u_skyDeep', 'u_skyMid', 'u_skyBright', 'u_causticTint',
    'u_shaftStrength', 'u_biolum', 'u_nightGlow',
    'u_lightning', 'u_rain', 'u_organicScale', 'u_bedWeights',
    'u_koiCount', 'u_koiPos', 'u_koiMeta', 'u_lanternCount', 'u_lanterns',
  ]);
  gl.useProgram(waterProg);
  gl.uniform1i(waterU.u_sim, 0);
  gl.uniform1i(waterU.u_caustic, 1);
  gl.uniform1f(waterU.u_half, POOL.halfExtent);
  gl.uniform1f(waterU.u_texel, texel);
  gl.uniform1f(waterU.u_worldDx, worldDx);
  gl.uniform1i(waterU.u_waveCount, WAVES.length);
  gl.uniform4fv(waterU.u_waves, packedWaves);
  gl.uniform1fv(waterU.u_phases, packedPhases);
  gl.uniform3fv(waterU.u_camera, CAMERA.eye);
  gl.uniform1f(waterU.u_floorY, POOL.floorY);
  gl.uniform1f(waterU.u_f0, WATER.f0);
  gl.uniform1f(waterU.u_ior, WATER.ior);
  gl.uniform3fv(waterU.u_absorption, WATER.absorption);

  const uiU = resolveUniforms(gl, uiGlassProg, [
    'u_scene', 'u_resolution', 'u_time', 'u_uiCount', 'u_uiRects', 'u_uiMeta',
    'u_sunDir', 'u_sunColor', 'u_skyDeep', 'u_skyMid', 'u_skyBright',
    'u_causticTint', 'u_biolum', 'u_nightGlow',
  ]);
  gl.useProgram(uiGlassProg);
  gl.uniform1i(uiU.u_scene, 0);

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
    gl.useProgram(waterProg);
    gl.uniformMatrix4fv(waterU.u_mvp, false, mvp);
  }
  rebuildCamera();

  const packedDrops = new Float32Array(SIM.maxDrops * 4);
  let targetTheme = THEMES.sunlit;
  let customSunDir = null;
  const activeTheme = cloneTheme(targetTheme);
  let targetBedWeights = POOL_BEDS.tiles.weights.slice();
  const activeBedWeights = POOL_BEDS.tiles.weights.slice();
  let activeCondition = WATER_CONDITIONS.breeze;
  let currentSwellScale = activeCondition.swellAmp;
  let currentOrganicScale = activeCondition.organicSlope;

  return {
    setTheme(themeId, immediate = false) {
      if (THEMES[themeId]) {
        targetTheme = THEMES[themeId];
        if (immediate) blendTheme(activeTheme, targetTheme, 1.0);
      }
    },
    setCustomTheme(themeObj) {
      if (themeObj && Array.isArray(themeObj.sunDir)) {
        targetTheme = themeObj;
      }
    },
    setCustomSunDir(dir) {
      customSunDir = Array.isArray(dir) ? norm(dir) : null;
    },
    getActiveTheme() {
      return activeTheme;
    },
    setBed(bedId, immediate = false) {
      if (POOL_BEDS[bedId]) {
        targetBedWeights = POOL_BEDS[bedId].weights.slice();
        if (immediate) lerpVec3(activeBedWeights, targetBedWeights, 1.0);
      }
    },
    setWaterCondition(conditionId, immediate = false) {
      if (WATER_CONDITIONS[conditionId]) {
        activeCondition = WATER_CONDITIONS[conditionId];
        if (immediate) {
          currentSwellScale = activeCondition.swellAmp;
          currentOrganicScale = activeCondition.organicSlope;
        }
      }
    },
    getSwellScale() {
      return currentSwellScale;
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
      bindGeometry(gl, updateVao, updatePosLoc, quadBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1f(updateU.u_waveSpeed, activeCondition.waveSpeed);
      gl.uniform1f(updateU.u_damping, activeCondition.damping);
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
      gl.uniform1i(updateU.u_dropCount, count);
      if (count > 0) {
        gl.uniform4fv(updateU.u_drops, packedDrops);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const swap = read;
      read = write;
      write = swap;
    },
    draw(timeSeconds, uiPills = null, lightning = 0, rainIntensity = 0, koiData = null, lanternData = null, swellTimeOverride = null) {
      blendTheme(activeTheme, targetTheme, 0.08);
      if (customSunDir) {
        lerpVec3(activeTheme.sunDir, customSunDir, 0.22);
        const u = norm(activeTheme.sunDir);
        activeTheme.sunDir[0] = u[0];
        activeTheme.sunDir[1] = u[1];
        activeTheme.sunDir[2] = u[2];
      }
      lerpVec3(activeBedWeights, targetBedWeights, 0.12);
      currentSwellScale += (activeCondition.swellAmp - currentSwellScale) * 0.08;
      currentOrganicScale += (activeCondition.organicSlope - currentOrganicScale) * 0.08;
      const swellT = swellTimeOverride !== null ? swellTimeOverride : timeSeconds * SWELL_TIME_SCALE;
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
      bindGeometry(gl, causticVao, causticPosLoc, posBuffer, indexBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1f(causticU.u_time, swellT);
      gl.uniform3fv(causticU.u_sunDir, activeTheme.sunDir);
      gl.uniform1f(causticU.u_swellScale, currentSwellScale);
      gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fb);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(activeTheme.skyDeep[0], activeTheme.skyDeep[1], activeTheme.skyDeep[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(waterProg);
      bindGeometry(gl, waterVao, waterPosLoc, posBuffer, indexBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, caustic.tex);
      gl.uniform1f(waterU.u_time, swellT);
      gl.uniform1f(waterU.u_swellScale, currentSwellScale);
      gl.uniform3fv(waterU.u_sunDir, activeTheme.sunDir);
      gl.uniform3fv(waterU.u_sunColor, activeTheme.sunColor);
      gl.uniform1f(waterU.u_sunIntensity, activeTheme.sunIntensity);
      gl.uniform3fv(waterU.u_tileDark, activeTheme.tileDark);
      gl.uniform3fv(waterU.u_tileMid, activeTheme.tileMid);
      gl.uniform3fv(waterU.u_tileBright, activeTheme.tileBright);
      gl.uniform3fv(waterU.u_groutCol, activeTheme.groutCol);
      gl.uniform3fv(waterU.u_skyDeep, activeTheme.skyDeep);
      gl.uniform3fv(waterU.u_skyMid, activeTheme.skyMid);
      gl.uniform3fv(waterU.u_skyBright, activeTheme.skyBright);
      gl.uniform3fv(waterU.u_causticTint, activeTheme.causticTint);
      gl.uniform1f(waterU.u_shaftStrength, activeTheme.shaftStrength);
      gl.uniform1f(waterU.u_biolum, activeTheme.biolum);
      gl.uniform1f(waterU.u_nightGlow, activeTheme.nightGlow);
      gl.uniform1f(waterU.u_lightning, lightning);
      gl.uniform1f(waterU.u_rain, rainIntensity);
      gl.uniform1f(waterU.u_organicScale, currentOrganicScale);
      gl.uniform3fv(waterU.u_bedWeights, activeBedWeights);
      const koiCount = koiData && koiData.count > 0 ? koiData.count : 0;
      gl.uniform1i(waterU.u_koiCount, koiCount);
      if (koiCount > 0) {
        gl.uniform4fv(waterU.u_koiPos, koiData.pos);
        gl.uniform4fv(waterU.u_koiMeta, koiData.meta);
      }
      const lanternCount = lanternData && lanternData.count > 0 ? lanternData.count : 0;
      gl.uniform1i(waterU.u_lanternCount, lanternCount);
      if (lanternCount > 0) {
        gl.uniform4fv(waterU.u_lanterns, lanternData.data);
      }
      gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(uiGlassProg);
      bindGeometry(gl, uiGlassVao, uiPosLoc, quadBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTarget.tex);
      gl.uniform2f(uiU.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(uiU.u_time, timeSeconds * SWELL_TIME_SCALE);
      const uiCount = uiPills && uiPills.count > 0 ? uiPills.count : 0;
      gl.uniform1i(uiU.u_uiCount, uiCount);
      if (uiCount > 0) {
        gl.uniform4fv(uiU.u_uiRects, uiPills.rects);
        gl.uniform4fv(uiU.u_uiMeta, uiPills.meta);
      }
      gl.uniform3fv(uiU.u_sunDir, activeTheme.sunDir);
      gl.uniform3fv(uiU.u_sunColor, activeTheme.sunColor);
      gl.uniform3fv(uiU.u_skyDeep, activeTheme.skyDeep);
      gl.uniform3fv(uiU.u_skyMid, activeTheme.skyMid);
      gl.uniform3fv(uiU.u_skyBright, activeTheme.skyBright);
      gl.uniform3fv(uiU.u_causticTint, activeTheme.causticTint);
      gl.uniform1f(uiU.u_biolum, activeTheme.biolum);
      gl.uniform1f(uiU.u_nightGlow, activeTheme.nightGlow);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    resize() {
      rebuildCamera();
      sceneTarget.resize(canvas.width, canvas.height);
    },
  };
}
