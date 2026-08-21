import { NextResponse } from 'next/server';

export function middleware(request){
  const { pathname }=request.nextUrl;
  if(pathname.startsWith('/jobs/')){
    const url=request.nextUrl.clone();
    url.pathname=pathname.replace(/^\/jobs\//,'/careers/');
    return NextResponse.redirect(url,308);
  }
  return NextResponse.next();
}

export const config={matcher:['/jobs/:path*']};
