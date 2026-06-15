'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Search,
  BookOpen,
  FileUp,
  ExternalLink,
  Database,
  Clock,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  source_type: 'builtin' | 'external';
  connection_config: Record<string, string> | null;
  dataset_name: string;
  document_count: number;
  updated_at: string;
}

interface SearchResult {
  content: string;
  score: number;
  source: string;
}

export default function KnowledgePage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDesc, setNewKbDesc] = useState('');
  const [newKbSource, setNewKbSource] = useState<'builtin' | 'external'>('builtin');
  const [newKbUrl, setNewKbUrl] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [uploadContent, setUploadContent] = useState('');
  const [activeTab, setActiveTab] = useState('bases');

  useEffect(() => {
    // Demo knowledge bases
    setKnowledgeBases([
      {
        id: '1',
        name: '产品历史文档',
        description: '历次产品迭代的PRD、技术方案和复盘总结',
        source_type: 'builtin',
        connection_config: null,
        dataset_name: 'product_history',
        document_count: 42,
        updated_at: '2025-01-15',
      },
      {
        id: '2',
        name: '研发能力边界',
        description: '技术栈清单、API能力列表、系统架构约束',
        source_type: 'builtin',
        connection_config: null,
        dataset_name: 'tech_capabilities',
        document_count: 18,
        updated_at: '2025-01-10',
      },
      {
        id: '3',
        name: '行业报告库',
        description: '对接外部行业研究报告数据源',
        source_type: 'external',
        connection_config: { type: 'confluence', url: 'https://wiki.example.com' },
        dataset_name: 'industry_reports',
        document_count: 156,
        updated_at: '2025-01-12',
      },
      {
        id: '4',
        name: '部门经验沉淀',
        description: '产品规划部门的最佳实践、模板和经验总结',
        source_type: 'builtin',
        connection_config: null,
        dataset_name: 'team_experience',
        document_count: 27,
        updated_at: '2025-01-08',
      },
    ]);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(`/api/knowledge?query=${encodeURIComponent(searchQuery)}&topK=5`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      // Demo results
      setSearchResults([
        { content: '电商平台v2.0支持社交分享功能，用户可将商品链接分享至微信、微博等平台，带来约15%的新增用户转化。', score: 0.92, source: '产品历史文档' },
        { content: '推荐系统基于协同过滤算法，当前CTR为3.2%，目标提升至5%。技术方案需升级为深度学习模型。', score: 0.87, source: '研发能力边界' },
        { content: '社交电商市场规模预计2025年达到2.5万亿，年增长率35%，头部平台MAU均超1亿。', score: 0.83, source: '行业报告库' },
      ]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleCreateKb = () => {
    if (!newKbName) return;

    const newKb: KnowledgeBase = {
      id: `kb-${Date.now()}`,
      name: newKbName,
      description: newKbDesc,
      source_type: newKbSource,
      connection_config: newKbSource === 'external' ? { type: 'custom', url: newKbUrl } : null,
      dataset_name: `kb_${Date.now()}`,
      document_count: 0,
      updated_at: new Date().toISOString().split('T')[0],
    };

    setKnowledgeBases((prev) => [newKb, ...prev]);
    setCreateDialogOpen(false);
    setNewKbName('');
    setNewKbDesc('');
    setNewKbUrl('');
  };

  const handleUpload = () => {
    if (!selectedKb || !uploadContent) return;

    setKnowledgeBases((prev) =>
      prev.map((kb) =>
        kb.id === selectedKb.id ? { ...kb, document_count: kb.document_count + 1 } : kb
      )
    );

    setUploadDialogOpen(false);
    setUploadContent('');
    setSelectedKb(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/40 p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">知识库</h1>
          <p className="text-muted-foreground text-sm mt-1">管理和检索规划过程中的知识资产</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="gap-2" onClick={() => setActiveTab('search')}>
            <Search className="h-4 w-4" />
            语义检索
          </Button>
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            新建知识库
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="bases">知识库列表</TabsTrigger>
            <TabsTrigger value="search">语义检索</TabsTrigger>
          </TabsList>

          <TabsContent value="bases">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {knowledgeBases.map((kb) => (
                <Card key={kb.id} className="border-border/60 hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {kb.source_type === 'builtin' ? (
                          <Database className="h-4 w-4 text-primary" />
                        ) : (
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                        )}
                        <CardTitle className="truncate text-base">{kb.name}</CardTitle>
                      </div>
                      <Badge className="shrink-0" variant={kb.source_type === 'builtin' ? 'secondary' : 'outline'}>
                        {kb.source_type === 'builtin' ? '内置' : '外部'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{kb.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{kb.document_count} 篇文档</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {kb.updated_at}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => {
                          setSelectedKb(kb);
                          setUploadDialogOpen(true);
                        }}
                      >
                        <FileUp className="h-3 w-3" />
                        上传
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Search className="h-3 w-3" />
                        检索
                      </Button>
                    </div>
                    {kb.source_type === 'external' && kb.connection_config && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        连接: {kb.connection_config.url}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="search">
            <div className="mx-auto flex max-w-2xl flex-col gap-6">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="输入关键词或自然语言描述来检索知识库..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <Button className="sm:w-auto" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? '检索中...' : '检索'}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">找到 {searchResults.length} 条相关内容</p>
                  {searchResults.map((result, idx) => (
                    <Card key={idx} className="border-border/60">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant="outline" className="text-xs">{result.source}</Badge>
                          <span className="text-xs text-muted-foreground">相似度: {(result.score * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-sm leading-relaxed">{result.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !isSearching && (
                <div className="text-center text-muted-foreground py-10">
                  <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p>输入查询条件开始检索</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Knowledge Base Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
            <DialogDescription>创建内置知识库或对接外部知识库服务</DialogDescription>
          </DialogHeader>
          <FieldGroup className="min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
            <Field>
              <FieldLabel htmlFor="knowledge-name">名称</FieldLabel>
              <Input
                id="knowledge-name"
                placeholder="如：产品历史文档"
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="knowledge-description">描述</FieldLabel>
              <Input
                id="knowledge-description"
                placeholder="简要描述知识库内容"
                value={newKbDesc}
                onChange={(e) => setNewKbDesc(e.target.value)}
              />
            </Field>
            <Tabs value={newKbSource} onValueChange={(v) => setNewKbSource(v as 'builtin' | 'external')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="builtin">内置知识库</TabsTrigger>
                <TabsTrigger value="external">外部知识库</TabsTrigger>
              </TabsList>
            </Tabs>
            {newKbSource === 'external' && (
              <Field>
                <FieldLabel htmlFor="knowledge-url">外部服务 URL</FieldLabel>
                <Input
                  id="knowledge-url"
                  placeholder="https://your-knowledge-base.example.com/api"
                  value={newKbUrl}
                  onChange={(e) => setNewKbUrl(e.target.value)}
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button className="w-full sm:w-auto" onClick={handleCreateKb} disabled={!newKbName}>
              创建知识库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>上传文档到「{selectedKb?.name}」</DialogTitle>
            <DialogDescription>将文档内容添加到知识库中</DialogDescription>
          </DialogHeader>
          <FieldGroup className="min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
            <Field>
              <FieldLabel htmlFor="knowledge-upload-content">文档内容</FieldLabel>
              <Textarea
                id="knowledge-upload-content"
                className="min-h-[200px] resize-none"
                placeholder="粘贴文档内容..."
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button className="w-full sm:w-auto" onClick={handleUpload} disabled={!uploadContent}>
              上传文档
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
