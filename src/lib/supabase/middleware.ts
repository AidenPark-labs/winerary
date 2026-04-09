import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const protectedPaths = ['/session']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))
  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 로그인된 사용자: 약관 동의 또는 출생연도 미입력 시 /agree로 리다이렉트
  const pathname = request.nextUrl.pathname
  const skipPaths = ['/agree', '/terms', '/privacy', '/login', '/register', '/api/', '/invite/', '/share/']
  const shouldCheck = user && !skipPaths.some(p => pathname.startsWith(p))
  if (shouldCheck) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('birth_year, agreed_at')
      .eq('id', user.id)
      .single()
    if (profile && (!profile.birth_year || !profile.agreed_at)) {
      return NextResponse.redirect(new URL('/agree', request.url))
    }
  }

  return supabaseResponse
}
