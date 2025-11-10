"use client";

import { Hero } from "@/components/hero";
import { Leva } from "leva";
import Marquee from "react-fast-marquee";

export default function Home() {
  return (
    <>
      <Hero />
      <Leva hidden />
      <div>
     
        <div className="mt-8 max-w-[1100px] mx-auto mb-16">
          <h4 className="text-center text-lg font-mono text-foreground/40 mb-8">
            <span className="">Trusted</span> by the best teams
          </h4>
          <Marquee
            speed={35}
            pauseOnHover
            gradient
            gradientColor="#000000"
            gradientWidth={80}
          >
            {[
              { src: "/trust/forgeifylogo.png", alt: "Forgeify" },
              { src: "/trust/piranest-logo.png", alt: "Piranest" },
              { src: "/trust/negative5logo.png", alt: "Negative5" },
              { src: "/trust/image 95.png", alt: "Image 95" },
              { src: "/trust/image 97.png", alt: "Image 97" },
              { src: "/trust/Group 427319678 1.png", alt: "Group" },
            ].map((item) => (
              <div key={item.src} className="mx-7 flex items-center">
                <img
                  src={item.src}
                  alt={item.alt}
                  className="h-7 w-auto opacity-50 hover:opacity-100 transition-opacity"
                />
              </div>
            ))}
          </Marquee>
        </div>
        <div className="mt-8 max-w-[1100px] mx-auto mb-16 border border-[#fff2] min-h-[900px]">

      </div>
      </div>
    </>
  );
}
