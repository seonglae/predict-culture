"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

interface CameraRigProps {
  mapSize: number;
}

export function CameraRig({ mapSize }: CameraRigProps) {
  const { camera } = useThree();

  useEffect(() => {
    const height = mapSize * 1.2;
    const distance = mapSize * 0.8;
    camera.position.set(0, height, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, mapSize]);

  return null;
}
