import { Effects } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Particles } from "./particles";
import { VignetteShader } from "./shaders/vignetteShader";

export const GL = ({ hovering }: { hovering: boolean }) => {
  // Fixed lightweight settings for production performance
  const speed = 1.0;
  const noiseScale = 0.6;
  const noiseIntensity = 0.52;
  const timeScale = 1.0;
  const focus = 3.8;
  const aperture = 1.79;
  const pointSize = 9.0;
  const opacity = 0.75;
  const planeScale = 10.0;
  const size = 256; // reduce from 512 -> 256 to cut GPU load by ~4x
  const vignetteDarkness = 1.4;
  const vignetteOffset = 0.4;
  const useManualTime = false;
  const manualTime = 0;
  return (
    <div id="webgl">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        camera={{
          position: [
            1.2629783123314589, 2.664606471394044, -1.8178993743288914,
          ],
          fov: 50,
          near: 0.01,
          far: 300,
        }}
      >
        <color attach="background" args={["#000"]} />
        <Particles
          speed={speed}
          aperture={aperture}
          focus={focus}
          size={size}
          noiseScale={noiseScale}
          noiseIntensity={noiseIntensity}
          timeScale={timeScale}
          pointSize={pointSize}
          opacity={opacity}
          planeScale={planeScale}
          useManualTime={useManualTime}
          manualTime={manualTime}
          introspect={hovering}
        />
        <Effects multisamping={0} disableGamma>
          <shaderPass
            args={[VignetteShader]}
            uniforms-darkness-value={vignetteDarkness}
            uniforms-offset-value={vignetteOffset}
          />
        </Effects>
      </Canvas>
    </div>
  );
};
