import { useEffect, useMemo, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { type Container, type ISourceOptions } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

export const ParticlesBackground = () => {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  const particlesLoaded = async (container?: Container): Promise<void> => {
    console.log(container);
  };

  const options: ISourceOptions = useMemo(
    () => ({
      background: {
        color: "transparent",
      },
      fpsLimit: 60,
      interactivity: {
        events: {
          onClick: {
            enable: true,
            mode: "push",
          },
          onHover: {
            enable: true,
            mode: "bubble",
          },
        },
        modes: {
          push: {
            quantity: 2,
          },
          bubble: {
            distance: 250,
            size: 40,
            duration: 2,
            opacity: 0.8,
          },
        },
      },
      particles: {
        color: {
          value: ["#FFC20E", "#38BDF8"],
        },
        links: {
          enable: false,
        },
        move: {
          direction: "top",
          enable: true,
          outModes: {
            default: "out",
          },
          random: true,
          speed: 2,
          straight: false,
        },
        number: {
          density: {
            enable: true,
          },
          value: 35,
        },
        opacity: {
          value: { min: 0.5, max: 0.8 },
          animation: {
            enable: true,
            speed: 1,
            sync: false,
          },
        },
        shape: {
          type: "circle",
        },
        size: {
          value: { min: 15, max: 35 },
          animation: {
            enable: true,
            speed: 5,
            sync: false,
          },
        },
        wobble: {
          enable: true,
          distance: 10,
          speed: 10,
        },
      },
      detectRetina: true,
    }),
    [],
  );

  if (init) {
    return (
      <Particles
        id="tsparticles"
        particlesLoaded={particlesLoaded}
        options={options}
        className="absolute inset-0 w-full h-full"
      />
    );
  }

  return null;
};
