
import type { SVGProps } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
    >
      <circle cx="20" cy="20" r="20" fill="currentColor" />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy=".3em"
        fill="white"
        fontSize="20"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
      >
        12
      </text>
    </svg>
  );
}

export function YouTubeLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        xmlns="http://www.w3.org/2000/svg" 
        className={cn("text-[#FF0000]", className)}
        {...props}
    >
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

export function IndianFlagIcon(props: Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'>) {
  return (
    <Image
      src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhMKzzG4tnb-TgQImLk2L7kQr0e8VK35XZAA7TNmC6thyufRLST44NsTN0pZ6iqLBv9pFlVcfZfTLLRbYFYdkrkpK2tQ_PJwsgIG_KNhJQza5XJuujpVTfkeH3f3hvZPyIraghjXBpX3kHfdpuHrJ05hCmoaJXiSx4MueaciHfUIo7rsV2H6hNGZj3oyN8d/s1080/25312.png"
      alt="Indian Flag"
      width={48}
      height={32}
      {...props}
    />
  );
}
