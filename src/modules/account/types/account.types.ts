// Proyección plana y serializable del `User` de Clerk. No hay tabla detrás: esta
// vista no consulta Postgres (spec 006, §5).
//
// El recorte es deliberado. `currentUser()` devuelve una instancia de clase con
// `privateMetadata`, `unsafeMetadata`, `banned`, `locked`, `externalId` y el getter
// `raw`; pasar ese objeto a un componente lo pondría a un `"use client"` de
// distancia de viajar entero al navegador (spec 006, D-6 y AC9).
export type AccountProfile = {
  fullName: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  imageUrl: string;
  // Fallback del avatar cuando Clerk no sirve foto propia (`hasImage === false`).
  initials: string;
  // ISO. `User.createdAt` y `User.lastSignInAt` llegan como Unix ms.
  createdAt: string;
  lastSignInAt: string | null;
};
