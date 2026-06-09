'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  Search,
  MoreVertical,
  Download,
  FileCode2,
  GitBranch,
  Globe,
  Star,
  Tag,
} from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  source_type: 'local' | 'registry' | 'git';
  methodology: string;
  tools: string[];
  outputs: Record<string, unknown>;
  checklist: string[];
  scope: 'personal' | 'team' | 'official';
  updated_at: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);

  // Import form state
  const [importSource, setImportSource] = useState<'local' | 'registry' | 'git'>('local');
  const [importPath, setImportPath] = useState('');
  const [importUrl, setImportUrl] = useState('');

  const fetchSkills = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('Failed to fetch skills');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (error) {
      console.error('Error fetching skills:', error);
      // Use demo data for preview
      setSkills([
        {
          id: '1',
          name: '竞品分析',
          description: '系统性分析竞品产品功能、市场定位、用户评价和差异化策略',
          version: '1.2.0',
          author: 'Product Team',
          tags: ['竞品', '分析', '市场'],
          source_type: 'registry',
          methodology: '1. 确定竞品范围\n2. 功能矩阵对比\n3. 用户体验评估\n4. 差异化策略制定',
          tools: ['web_search', 'knowledge_query'],
          outputs: { format: 'structured_report', sections: ['overview', 'feature_matrix', 'swot', 'strategy'] },
          checklist: ['至少包含3个竞品', '功能对比完整', '有明确差异化结论'],
          scope: 'official',
          updated_at: '2025-01-15',
        },
        {
          id: '2',
          name: '市场洞察',
          description: '从行业趋势、市场规模、用户需求变化等维度洞察市场机会',
          version: '1.0.0',
          author: 'Strategy Team',
          tags: ['市场', '洞察', '趋势'],
          source_type: 'git',
          methodology: '1. 行业趋势扫描\n2. 市场规模估算\n3. 用户需求变化分析\n4. 机会点提炼',
          tools: ['web_search', 'knowledge_query', 'data_query'],
          outputs: { format: 'structured_report', sections: ['trends', 'market_size', 'user_needs', 'opportunities'] },
          checklist: ['引用数据来源', '趋势有量化支撑', '机会点可执行'],
          scope: 'team',
          updated_at: '2025-01-10',
        },
        {
          id: '3',
          name: '用户需求拆解',
          description: '将高层业务需求拆解为可执行的用户故事和验收标准',
          version: '2.0.0',
          author: 'PM Center',
          tags: ['需求', '拆解', '用户故事'],
          source_type: 'local',
          methodology: '1. 业务目标确认\n2. 用户角色识别\n3. 核心场景梳理\n4. 用户故事编写\n5. 验收标准定义',
          tools: ['knowledge_query'],
          outputs: { format: 'user_stories', sections: ['personas', 'stories', 'acceptance_criteria'] },
          checklist: ['每个故事有验收标准', '覆盖所有角色', '优先级已标注'],
          scope: 'personal',
          updated_at: '2025-01-12',
        },
        {
          id: '4',
          name: '技术可行性评估',
          description: '评估需求的技术实现可行性，识别技术风险和约束',
          version: '1.1.0',
          author: 'Tech Lead',
          tags: ['技术', '评估', '可行性'],
          source_type: 'registry',
          methodology: '1. 技术栈匹配分析\n2. 现有能力边界评估\n3. 技术风险识别\n4. 实现路径建议',
          tools: ['data_query', 'knowledge_query', 'api_call'],
          outputs: { format: 'assessment', sections: ['capability_analysis', 'risks', 'recommendations'] },
          checklist: ['覆盖所有技术维度', '风险有缓解方案', '实现路径有工时估算'],
          scope: 'team',
          updated_at: '2025-01-08',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'personal' && skill.scope === 'personal') ||
      (activeTab === 'team' && skill.scope === 'team') ||
      (activeTab === 'official' && skill.scope === 'official');

    return matchesSearch && matchesTab;
  });

  const handleImport = async () => {
    try {
      const payload: Record<string, string> = { source_type: importSource };
      if (importSource === 'local') payload.path = importPath;
      if (importSource === 'registry') payload.url = importUrl;
      if (importSource === 'git') payload.url = importUrl;

      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', ...payload }),
      });

      if (!res.ok) throw new Error('Import failed');
      setImportDialogOpen(false);
      setImportPath('');
      setImportUrl('');
      fetchSkills();
    } catch (error) {
      console.error('Import error:', error);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'local':
        return <FileCode2 className="h-4 w-4" />;
      case 'registry':
        return <Globe className="h-4 w-4" />;
      case 'git':
        return <GitBranch className="h-4 w-4" />;
      default:
        return <FileCode2 className="h-4 w-4" />;
    }
  };

  const getScopeBadge = (scope: string) => {
    switch (scope) {
      case 'official':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><Star className="h-3 w-3 mr-1" />官方</Badge>;
      case 'team':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">团队</Badge>;
      case 'personal':
        return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">个人</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skill 仓库</h1>
          <p className="text-muted-foreground text-sm mt-1">管理和导入规划工作所需的 Skill 能力单元</p>
        </div>
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Download className="h-4 w-4" />
              导入 Skill
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>导入 Skill</DialogTitle>
              <DialogDescription>从不同来源导入已创建好的 Skill</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <Tabs value={importSource} onValueChange={(v) => setImportSource(v as 'local' | 'registry' | 'git')}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="local">本地文件</TabsTrigger>
                  <TabsTrigger value="registry">远程注册中心</TabsTrigger>
                  <TabsTrigger value="git">Git 仓库</TabsTrigger>
                </TabsList>
              </Tabs>
              {importSource === 'local' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Skill 文件路径</label>
                  <Input
                    placeholder="/path/to/skill/competitive-analysis"
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                  />
                </div>
              )}
              {importSource === 'registry' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">注册中心 URL</label>
                  <Input
                    placeholder="https://skill-registry.example.com/skills/market-insight"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                </div>
              )}
              {importSource === 'git' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Git 仓库地址</label>
                  <Input
                    placeholder="https://github.com/org/skill-library.git"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                </div>
              )}
              <Button className="w-full" onClick={handleImport}>
                确认导入
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Search and Filter */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索 Skill 名称、描述或标签..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="official">官方</TabsTrigger>
                <TabsTrigger value="team">团队</TabsTrigger>
                <TabsTrigger value="personal">个人</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Skill Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
          ) : filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileCode2 className="h-12 w-12 mb-4 opacity-30" />
              <p>暂无 Skill</p>
              <p className="text-sm mt-1">点击上方"导入 Skill"添加你的第一个 Skill</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSkills.map((skill) => (
                <Card
                  key={skill.id}
                  className="cursor-pointer hover:shadow-md transition-shadow border-border/60 group"
                  onClick={() => setDetailSkill(skill)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getSourceIcon(skill.source_type)}
                        <CardTitle className="text-base">{skill.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {getScopeBadge(skill.scope)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>更新到最新版本</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>复制到个人空间</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()} className="text-red-600">移除</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <CardDescription className="line-clamp-2">{skill.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>v{skill.version}</span>
                      <span>{skill.author}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {skill.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          <Tag className="h-2.5 w-2.5 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {skill.tools.length > 0 && (
                      <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                        <span>工具:</span>
                        {skill.tools.map((tool) => (
                          <Badge key={tool} variant="secondary" className="text-xs font-normal">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Skill Detail Dialog */}
      <Dialog open={!!detailSkill} onOpenChange={(open) => !open && setDetailSkill(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          {detailSkill && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {getSourceIcon(detailSkill.source_type)}
                  <DialogTitle className="text-xl">{detailSkill.name}</DialogTitle>
                  <Badge variant="outline">v{detailSkill.version}</Badge>
                  {getScopeBadge(detailSkill.scope)}
                </div>
                <DialogDescription>{detailSkill.description}</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-6 mt-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">方法论框架</h4>
                    <pre className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap font-sans">
                      {detailSkill.methodology}
                    </pre>
                  </div>
                  {detailSkill.tools.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">绑定工具</h4>
                      <div className="flex flex-wrap gap-2">
                        {detailSkill.tools.map((tool) => (
                          <Badge key={tool} variant="secondary">{tool}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {detailSkill.checklist.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">质量 Checklist</h4>
                      <ul className="space-y-1">
                        {detailSkill.checklist.map((item, idx) => (
                          <li key={idx} className="text-sm flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detailSkill.outputs && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">输出结构</h4>
                      <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-auto">
                        {JSON.stringify(detailSkill.outputs, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span>作者: {detailSkill.author}</span>
                    <span>更新于: {detailSkill.updated_at}</span>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
