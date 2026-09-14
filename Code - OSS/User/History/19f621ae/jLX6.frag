#version 300 es

// Hand-drawn Sketch Effect, by hlorenzi

highp float EDGE_WIglslDTH = 0.15;
highp float RAYMARCH_ITERATIONS = 40;
highp float SHADOW_ITERATIONS = 50;
highp float SHADOW_STEP = 1.0;
highp float SHADOW_SMOOTHNESS = 256.0;
highp float SHADOW_DARKNESS = 0.75;

// Distance functions from iquilezles.org
highp float fSubtraction(highp float a, highp float b) {return max(-a,b);}
highp float fIntersection(highp float d1, highp float d2) {return max(d1,d2);}
void fUnion(inout highp float d1, highp float d2) {d1 = min(d1,d2);}
highp float pSphere(highp vec3 p, highp float s) {return length(p)-s;}
highp float pRoundBox(highp vec3 p, highp vec3 b, highp float r) {return length(max(abs(p)-b,0.0))-r;}
highp float pTorus(highp vec3 p, highp vec2 t) {highp vec2 q = vec2(length(p.xz)-t.x,p.y); return length(q)-t.y;}
highp float pTorus2(highp vec3 p, highp vec2 t) {highp vec2 q = vec2(length(p.xy)-t.x,p.z); return length(q)-t.y;}
highp float pCapsule(highp vec3 p, highp vec3 a, highp vec3 b, highp float r) {highp vec3 pa = p - a, ba = b - a;
	highp float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 ); return length( pa - ba*h ) - r;}

highp float distf(highp vec3 p)
{
	highp float d = 100000.0;
	
	fUnion(d, pRoundBox(vec3(0,0,10) + p, vec3(21,21,1), 1.0));
	fUnion(d, pSphere(vec3(10,10,0) + p, 8.0));
	fUnion(d, pSphere(vec3(16,0,4) + p, 4.0));
	fUnion(d, pCapsule(p, vec3(10,10,12), vec3(15,15,-6.5), 1.5));
	fUnion(d, pCapsule(p, vec3(10,10,12), vec3(5,15,-6.5), 1.5));
	fUnion(d, pCapsule(p, vec3(10,10,12), vec3(10,5,-6.5), 1.5));
	fUnion(d, pTorus(vec3(15,-15,0) + p, vec2(6,2)));
	fUnion(d, pTorus2(vec3(10,-15,0) + p, vec2(6,2)));
	fUnion(d, pRoundBox(vec3(-10,10,-2) + p, vec3(1,1,9), 1.0));
	fUnion(d, pRoundBox(vec3(-10,10,-4) + p, vec3(0.5,6,0.5), 1.0));
	fUnion(d, pRoundBox(vec3(-10,10,2) + p, vec3(6,0.5,0.5), 1.0));
	
	return d;
}


highp vec3 normal(highp vec3 p)
{
	const highp float eps = 0.01;
	highp float m;
    highp vec3 n = vec3( (distf(vec3(p.x-eps,p.y,p.z)) - distf(vec3(p.x+eps,p.y,p.z))),
                   (distf(vec3(p.x,p.y-eps,p.z)) - distf(vec3(p.x,p.y+eps,p.z))),
                   (distf(vec3(p.x,p.y,p.z-eps)) - distf(vec3(p.x,p.y,p.z+eps)))
				 );
    return normalize(n);
}

highp vec4 raymarch(highp vec3 from, highp vec3 increment)
{
	const highp float maxDist = 200.0;
	const highp float minDist = 0.001;
	const int maxIter = RAYMARCH_ITERATIONS;
	
	highp float dist = 0.0;
	
	highp float lastDistEval = 1e10;
	highp float edge = 0.0;
	
	for(int i = 0; i < maxIter; i++) {
		highp vec3 pos = (from + increment * dist);
		highp float distEval = distf(pos);
		
		if (lastDistEval < EDGE_WIDTH && distEval > lastDistEval + 0.001) {
			edge = 1.0;
		}
		
		if (distEval < minDist) {
			break;
		}
		
		dist += distEval;
		if (distEval < lastDistEval) lastDistEval = distEval;
	}
	
	highp float mat = 1.0;
	if (dist >= maxDist) mat = 0.0;
	
	return vec4(dist, mat, edge, 0);
}

highp float shadow(highp vec3 from, highp vec3 increment)
{
	const highp float minDist = 1.0;
	
	highp float res = 1.0;
	highp float t = 1.0;
	for(int i = 0; i < SHADOW_ITERATIONS; i++) {
        highp float h = distf(from + increment * t);
        if(h < minDist)
            return 0.0;
		
		res = min(res, SHADOW_SMOOTHNESS * h / t);
        t += SHADOW_STEP;
    }
    return res;
}

highp float rand(highp float x)
{
    return fract(sin(x) * 43758.5453);
}

highp float triangle(highp float x)
{
	return abs(1.0 - mod(abs(x), 2.0)) * 2.0 - 1.0;
}

highp float time;
highp vec4 getPixel(highp vec2 p, highp vec3 from, highp vec3 increment, highp vec3 light)
{
	time = 0.0;
	highp vec4 c = raymarch(from, increment);
	highp vec3 hitPos = from + increment * c.x;
	highp vec3 normalDir = normal(hitPos);
	
	
	highp float diffuse = 1.0 + min(0.0, dot(normalDir, -light));
	highp float inshadow = 0.0;//(1.0 - shadow(hitPos, -light)) * SHADOW_DARKNESS;
	
	diffuse = max(diffuse, inshadow);
	
	if (c.y == 0.0) diffuse = min(pow(length(p), 4.0) * 0.125,1.0);
	
	
	highp float xs = (rand(time * 6.6) * 0.1 + 0.9);
	highp float ys = (rand(time * 6.6) * 0.1 + 0.9);
	highp float hatching = max((clamp((sin(p.x * xs * (170.0 + rand(time) * 30.0) +
							p.y * ys * (110.0 + rand(time * 1.91) * 30.0)) * 0.5 + 0.5) -
						   		(1.0 - diffuse), 0.0, 1.0)),
						 (clamp((sin(p.x * xs * (-110.0 + rand(time * 4.74) * 30.0) +
							p.y * ys * (170.0 + rand(time * 3.91) * 30.0)) * 0.5 + 0.5) -
						   		(1.0 - diffuse) - 0.4, 0.0, 1.0)));
	
	highp vec4 mCol = mix(vec4(1,0.9,0.8,1), vec4(1,0.9,0.8,1) * 0.5, hatching);
					
	return mix(mCol,vec4(1,0.9,0.8,1) * 0.5,c.z);
}


void main( out highp vec4 fragColor, in highp vec2 fragCoord )
{	
	highp float iTime = 0.0;
	highp vec3 iResolution = vec3(0.0, 0.0, 0.0);
	highp vec4 iMouse = vec4(0.0, 0.0, 0.0, 0.0);
	time = floor(iTime * 16.0) / 16.0;
	// pixel position
	highp vec2 q = fragCoord.xy / iResolution.xy;
	highp vec2 p = -1.0+2.0*q;
	p.x *= -iResolution.x/iResolution.y;
	p += vec2(triangle(p.y * rand(time) * 4.0) * rand(time * 1.9) * 0.015,
			triangle(p.x * rand(time * 3.4) * 4.0) * rand(time * 2.1) * 0.015);
	p += vec2(rand(p.x * 3.1 + p.y * 8.7) * 0.01,
			  rand(p.x * 1.1 + p.y * 6.7) * 0.01);
	
	// mouse
    highp vec2 mo = iMouse.xy/iResolution.xy;
	highp vec2 m = iMouse.xy / iResolution.xy;
	if (iMouse.x == 0.0 && iMouse.y == 0.0) {
		m = vec2(time * 0.06 + 1.67, 0.78);	
	}
	m = -1.0 + 2.0 * m;
	m *= vec2(4.0,-0.75);
	m.y += 0.75;

	// camera position
	highp float dist = 50.0;
	highp vec3 ta = vec3(0,0,0);
	highp vec3 ro = vec3(cos(m.x) * cos(m.y) * dist, sin(m.x) * cos(m.y) * dist, sin(m.y) * dist);
	highp vec3 light = vec3(cos(m.x - 2.27) * 50.0, sin(m.x - 2.27) * 50.0, -20.0);
	
	// camera direction
	highp vec3 cw = normalize( ta-ro );
	highp vec3 cp = vec3( 0.0, 0.0, 1.0 );
	highp vec3 cu = normalize( cross(cw,cp) );
	highp vec3 cv = normalize( cross(cu,cw) );
	highp vec3 rd = normalize( p.x*cu + p.y*cv + 2.5*cw );

	// calculate color
	highp vec4 col = getPixel(p, ro, rd, normalize(light));
    col = pow(col, vec4(1.0 / 2.2));
    col = col * 1.8 - 0.8;
	fragColor = col;
	
}
