import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'BattleFlow | 产品规划工作流平台',
    template: '%s | BattleFlow',
  },
  description:
    'BattleFlow 是面向 AI Native 产品规划的 Skill 编排和工作流平台，支持沉淀方法、编排任务、追踪产出。',
  keywords: [
    'BattleFlow',
    '产品规划',
    'Skill 编排',
    'AI Native',
    '工作流',
    '知识库',
    'PRD',
  ],
  authors: [{ name: 'BattleFlow Team' }],
  generator: 'BattleFlow',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: 'BattleFlow | AI Native 产品规划工作流平台',
    description:
      '沉淀 Skill、编排任务、追踪产品规划产出。',
    siteName: 'BattleFlow',
    locale: 'zh_CN',
    type: 'website',
    // images: [
    //   {
    //     url: '',
    //     width: 1200,
    //     height: 630,
    //     alt: 'BattleFlow',
    //   },
    // ],
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'BattleFlow',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('battleflow-theme')||localStorage.getItem('planflow-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        <SupabaseConfigProvider>
          {isDev && <Inspector />}
          {children}
        </SupabaseConfigProvider>
      </body>
    </html>
  );
}
