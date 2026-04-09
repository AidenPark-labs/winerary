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

  // 로그인된 사용자: 프로필 상태 확인
  const pathname = request.nextUrl.pathname
  const skipPaths = ['/agree', '/blocked', '/terms', '/privacy', '/login', '/register', '/api/', '/invite/', '/share/']
  const shouldCheck = user && !skipPaths.some(p => pathname.startsWith(p))
  if (shouldCheck) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('birth_year, agreed_at')
      .eq('id', user.id)
      .single()
    if (profile) {
      // 만 19세 미만: 이용 차단
      if (profile.birth_year && new Date().getFullYear() - profile.birth_year < 19) {
        return NextResponse.redirect(new URL('/blocked', request.url))
      }
      // 약관 미동의 또는 출생연도 미입력: 동의 페이지로
      if (!profile.birth_year || !profile.agreed_at) {
        return NextResponse.redirect(new URL('/agree', request.url))
      }
    }
  }

  return supabaseResponse
}
