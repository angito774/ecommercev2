import { Skeleton } from '@/components/ui/skeleton';

// La silueta real de la ficha —migas, marco de media 4:3 a 7 columnas, columna de
// información y tira de relacionados— y no un esqueleto genérico: si las cajas no
// coinciden con el contenido, el relleno provoca justo el salto de layout que el
// esqueleto viene a evitar.
export default function ProductDetailLoading() {
  return (
    <>
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)] pt-[clamp(0.5rem,2vw,1.25rem)] pb-[clamp(2.5rem,6vw,4rem)]">
        <Skeleton className="h-11 w-64 rounded-full" />

        <div className="mt-3 grid items-start gap-[clamp(1.75rem,4vw,3.25rem)] min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Skeleton className="aspect-[4/3] w-full rounded-[30px]" />

          <div className="flex flex-col gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-10 w-3/4 max-w-sm" />
            <Skeleton className="h-16 w-full max-w-[52ch]" />
            <Skeleton className="mt-2 h-12 w-52" />
            <Skeleton className="h-12 w-[11rem] rounded-full" />

            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-border border-t py-[clamp(2.5rem,6vw,4.5rem)]">
        <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
          <Skeleton className="mb-[clamp(1.5rem,3vw,2.5rem)] h-9 w-56" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:gap-5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[340px] rounded-[22px]" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
