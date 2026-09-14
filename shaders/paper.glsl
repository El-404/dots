#version 320 es

precision highp float;
in vec2 v_texcoord;
uniform sampler2D tex;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.t) * p3.z);
}

float getCanvasHeight(vec2 pos) {
  float weaveX = sin(pos.x * 2.0);
  float weaveY = sin(pos.y * 2.0);
  float weave = (weaveX + weaveY) / 2.0;

  float noise = hash(pos * 0.5) * 0.6 + hash(pos * 1.5) * 0.4;
  return weave * .2 + noise * .8;
}

// 4x4 Bayer Matrix
// this grid helps break up smooth gradients into texture so it looks less "digital"
float getBayer(vec2 pos){
  int x = int(mod(pos.x, 4.0));
  int y = int(mod(pos.y, 4.0));
  const mat4 bayer = mat4(
    0.0, 12., 3.0, 15.,
    8.0, 4.0, 11., 7.0,
    2.0, 14., 1.0, 13.0,
    10., 6.0, 9.0, 5.0
  );
  return bayer[x][y] / 16.0;
}

float paperTexture(vec2 uv) {
  float n = 0.0;
  n += hash(uv * 0.3) * 0.6;
  n += hash(uv * 0.8) * 0.4;
  n += hash(uv * 2.5) * 0.3;
  n += hash(uv * 6.0) * 0.2;
  n += hash(uv * 15.0) * 0.1;
  return n / 1.6;
}

// Directional paper grain (simulates paper fibers running in one direction)
float directionalGrain(vec2 uv) {
    vec2 direction = vec2(0.7, 0.3); // Fiber direction
    float grain = 0.0;
    grain += hash(uv * 3.0 + direction * 2.0) * 0.5;
    grain += hash(uv * 8.0 + direction * 5.0) * 0.3;
    return grain / 0.8;
}

// Subtle vignette for paper edge darkening
float vignette(vec2 uv) {
    vec2 center = uv - 0.5;
    float dist = length(center);
    // smoothstep creates a signmoid (S-curve) so the shadow falls off naturally
    return 1.0 - smoothstep(0.4, 1.2, dist) * 0.15;
}



vec4 artCanvas(vec4 pixColor) {
    vec3 color = pixColor.rgb;
    
    vec3 canvasWhite = vec3(0.92, 0.92, 0.92); 
    vec3 pigmentBlack = vec3(0.12, 0.13, 0.14); // Deep charcoal shadow
    
    // Compress dynamic range into the physical palette limits
    color = mix(pigmentBlack, canvasWhite, color);
    
    // Desaturation
    // Digital colors are too pure. Pigments have wider spectrums (also makes it look more 'matte').
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 0.75);
    
    // 3D Surface & Directional Lighting
    vec2 pos = gl_FragCoord.xy;
    float heightCenter = getCanvasHeight(pos);
    
    // Sample top-left pixel to calculate fake surface normal / bump
    float heightTopLeft = getCanvasHeight(pos + vec2(-1.0, 1.0));
    
    // Simulated spotlight coming from a top-left angle
    float bump = (heightCenter - heightTopLeft);
    
    // Heavy dark paint fills the canvas grain. Light areas show more raw canvas.
    float paintThickness = 1.0 - smoothstep(0.1, 0.9, luma);
    float textureStrength = mix(0.12, 0.03, paintThickness);
    
    // Apply directional highlight/shadow to the bumps
    color += bump * textureStrength;
    
    // Apply ambient occlusion (recessed pits in the canvas are darker)
    color *= (0.92 + 0.08 * heightCenter);
    
    // Spotlight Wash
    vec2 center = v_texcoord - 0.5;
    float dist = length(center);
    float vig = 1.0 - smoothstep(0.3, 1.2, dist) * 0.2;
    
    color *= vec3(1.0, 1.0, 1.0); // Neutral wash
    color *= vig;
    
    return vec4(clamp(color, 0.0, 1.0), pixColor.a);
}

float angleBetween(vec4 a, vec4 b) {
  a = normalize(a);
  b = normalize(b);
  float dotProduct = clamp(dot(a,b),-1.0,1.0);
  return acos(dotProduct);
}

void main() {
    vec4 pixColor = texture(tex, v_texcoord);
    
    // Luma Conversion
    // not using average (r+g+b)/3 because eyes see green brighter than blue.
    float gray = dot(pixColor.rgb, vec3(0.299, 0.587, 0.114));
    
    // E-ink characteristic response curve
    // real e-ink isn't linear. this exponent simulates ink clumping.
    gray = pow(gray, 1.2);
    
    // Better contrast with slight S-curve
    // clips pure blacks/whites but keeps the middle smooth.
    gray = smoothstep(0.08, 0.92, gray);
    
    // Mid-tone boost
    float midBoost = smoothstep(0.3, 0.5, gray) * (1.0 - smoothstep(0.5, 0.7, gray));
    gray += midBoost * 0.1;
    
    vec2 screenPos = gl_FragCoord.xy;
    
    // PAPER GRAIN 
    float paperGrain = (paperTexture(screenPos * 0.3) - 0.5) * 0.035; 
    float dirGrain = (directionalGrain(screenPos * 0.4) - 0.5) * 0.025; // directional grain
    
    float bayerValue = getBayer(screenPos);
    
    // Apply to bright areas (paper), but also slightly to mid-tones for more visible grain
    float textureMask = smoothstep(0.5, 0.95, gray); // Lower threshold for more coverage
    
    // Apply both grain types
    gray += paperGrain * textureMask;
    gray += dirGrain * textureMask * 0.7; // Directional grain is slightly weaker
    
    // Increased dithering for more texture
    float ditherStrength = 0.025; // Increased from 0.018
    gray += (bayerValue - 0.5) * ditherStrength * textureMask;
    
    // Vignette for paper edges
    float vig = vignette(v_texcoord);
    gray *= vig;
    
    gray = clamp(gray, 0.0, 1.0);
    
    // E-ink colors with slight warmth variation
    vec3 paperColor = vec3(0.94, 0.92, 0.86);
    vec3 inkColor   = vec3(0.10, 0.10, 0.12);
    
    // More noticeable color variation for paper texture
    float colorVariation = hash(screenPos * 0.08) * 0.02; // Increased from 0.01
    paperColor += vec3(colorVariation, colorVariation * 0.5, -colorVariation * 0.2);
    
    // linear interpolation. paints the gray value onto our specific color palette.
    vec3 finalColor = mix(inkColor, paperColor, gray);
    vec4 base = vec4(finalColor, pixColor.a);
    vec4 overlay = artCanvas(pixColor);
    vec4 result;

    //if((pixColor.x + pixColor.y + pixColor.z) / 3.0 < 0.5 ) {
    //  result = min(base, overlay);
    //} else {
    //  result = min(base, overlay);
    //}

    //result = 1.0 - (1.0 - base) * (1.0 - overlay);

    result = mix(base, overlay, 0.6);

    fragColor = result;
}



