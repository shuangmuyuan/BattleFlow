'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { CheckCircle2, GitBranch, Layers3 } from 'lucide-react';
import { BattleFlowBrand } from '@/components/battleflow/brand';
import { AnimatedThemeToggler } from '@/registry/magicui/animated-theme-toggler';

const visualHighlights = [
  { icon: Layers3, value: '可复用', label: '团队 Skill' },
  { icon: GitBranch, value: '可编排', label: '规划流程' },
  { icon: CheckCircle2, value: '可追溯', label: '审核产物' },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(26rem,1fr)]">
      <section className="relative hidden min-h-dvh overflow-hidden border-r border-border lg:block">
        <Image
          src="/brand/product-planning-desk.png"
          alt="Product planning materials arranged on a focused work desk"
          fill
          priority
          sizes="64vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-background/35" />
        <div className="absolute inset-0 p-8 xl:p-12">
          <BattleFlowBrand
            className="w-fit rounded-md border border-white/15 bg-black/30 px-3 py-2 [&_*]:text-white"
            markClassName="border-white/20 bg-white/10 text-white"
            subtitle="AI-native product planning"
          />

          <div className="absolute right-8 top-1/2 w-[min(34rem,calc(100%-4rem))] -translate-y-1/2 rounded-md border border-white/15 bg-black/45 p-6 text-white shadow-2xl xl:right-12 xl:w-[min(36rem,calc(100%-6rem))] xl:p-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              Product planning command desk
            </p>
            <h1 className="text-3xl font-semibold leading-tight xl:text-4xl">BattleFlow</h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/75 xl:text-base">
              让每一次产品判断，都有方法、上下文和可追溯的产物。
            </p>
            <div className="mt-7 grid grid-cols-3 border-t border-white/15 pt-5">
              {visualHighlights.map((item, index) => (
                <div
                  key={item.label}
                  className={index > 0 ? 'border-l border-white/15 pl-5' : ''}
                >
                  <item.icon className="mb-2 size-4 text-brand" />
                  <p className="text-sm font-semibold">{item.value}</p>
                  <p className="mt-0.5 text-xs text-white/55">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-dvh items-center justify-center px-4 py-14 sm:px-8 lg:px-10">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <AnimatedThemeToggler variant="square" />
        </div>
        <div className="content-enter w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <BattleFlowBrand subtitle="AI 原生产品规划平台" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
