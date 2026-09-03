import { Skeleton } from '@/components/ui/skeleton';

// Con `loading.tsx` Next envuelve el segmento en un Suspense y envía la cabecera, el
// pie y la barra de avisos —que no dependen del catálogo— antes de que Neon
// responda. Sin él, el visitante no recibe un solo byte hasta que terminan las
// lecturas del servidor.
//
// El esqueleto imita la silueta real de la portada (hero a dos columnas y rejilla)
// para que al llegar el contenido no haya salto de layout.
export default function StorefrontLoading() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)] py-[clamp(2rem,6vw,4rem)]">
      <div className="grid items-center gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-4">
          <Skeleton className="h-8 w-56 rounded-full" />
          <Skeleton className="h-16 w-full max-w-xl" />
          <Skeleton className="h-16 w-4/5 max-w-lg" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-12 w-48 rounded-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </div>
        </div>
        <Skeleton className="aspect-[4/3] w-full rounded-[30px]" />
      </div>

      <div className="mt-20 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 xl:gap-5">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-[340px] rounded-[22px]" />
        ))}
      </div>
    </div>
  );
}
