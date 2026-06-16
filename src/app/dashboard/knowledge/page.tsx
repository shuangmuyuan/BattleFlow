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
import {
  PageHeader,
  ProductEmptyState,
  StatusBadge,
  appCardClassName,
} from '@/components/battleflow/ui';

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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [serviceNotice, setServiceNotice] = useState('');

  const applyServiceNotice = useCallback((data: { serviceUnavailable?: boolean; error?: string }) => {
    if (!data.serviceUnavailable) return false;
    setServiceNotice(data.error || '知识库服务未配置，暂时无法访问知识库资产。');
    setErrorMessage('');
    return true;
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadKnowledgeBases() {
      setLoading(true);
      setErrorMessage('');
      setServiceNotice('');
      try {
        const res = await fetch('/api/knowledge', { cache: 'no-store' });
        const data = await res.json();
        if (!ignore && applyServiceNotice(data)) {
          setKnowledgeBases(data.knowledgeBases || []);
          return;
        }
        if (!res.ok) throw new Error(data.error || '知识库加载失败');
        if (!ignore) setKnowledgeBases(data.knowledgeBases || []);
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : '知识库加载失败');
          setKnowledgeBases([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadKnowledgeBases();
    return () => {
      ignore = true;
    };
  }, [applyServiceNotice]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      setErrorMessage('');
      setServiceNotice('');
      const res = await fetch(`/api/knowledge?query=${encodeURIComponent(searchQuery)}&topK=5`);
      const data = await res.json();
      if (applyServiceNotice(data)) {
        setSearchResults([]);
        return;
      }
      if (!res.ok) throw new Error(data.error || '知识检索失败');
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      setErrorMessage(error instanceof Error ? error.message : '知识检索失败');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [applyServiceNotice, searchQuery]);

  const handleCreateKb = async () => {
    if (!newKbName) return;

    try {
      setErrorMessage('');
      setServiceNotice('');
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: newKbName,
          description: newKbDesc,
          source_type: newKbSource,
          connection_config: newKbSource === 'external' ? { type: 'custom', url: newKbUrl } : null,
        }),
      });
      const data = await res.json();
      if (applyServiceNotice(data)) return;
      if (!res.ok) throw new Error(data.error || '知识库创建失败');
      setKnowledgeBases((prev) => [data.knowledgeBase, ...prev]);
      setCreateDialogOpen(false);
      setNewKbName('');
      setNewKbDesc('');
      setNewKbUrl('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '知识库创建失败');
    }
  };

  const handleUpload = async () => {
    if (!selectedKb || !uploadContent) return;

    try {
      setErrorMessage('');
      setServiceNotice('');
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_documents',
          knowledge_base_id: selectedKb.id,
          documents: [{ source_type: 'text', content: uploadContent }],
        }),
      });
      const data = await res.json();
      if (applyServiceNotice(data)) return;
      if (!res.ok) throw new Error(data.error || '文档上传失败');

      setKnowledgeBases((prev) =>
        prev.map((kb) =>
          kb.id === selectedKb.id ? { ...kb, document_count: kb.document_count + 1 } : kb
        )
      );
      setUploadDialogOpen(false);
      setUploadContent('');
      setSelectedKb(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '文档上传失败');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="知识库"
        description="管理规划过程中的知识资产，让工作流能够引用真实上下文和评审材料。"
        action={(
          <>
          <Button variant="outline" className="gap-2" onClick={() => setActiveTab('search')}>
            <Search className="h-4 w-4" />
            语义检索
          </Button>
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            新建知识库
          </Button>
          </>
        )}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {serviceNotice && (
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {serviceNotice}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="bases">知识库列表</TabsTrigger>
            <TabsTrigger value="search">语义检索</TabsTrigger>
          </TabsList>

          <TabsContent value="bases">
            {loading ? (
              <ProductEmptyState
                icon={<Database />}
                title="正在加载知识库"
                description="正在连接知识库服务并读取资产列表。"
              />
            ) : knowledgeBases.length === 0 ? (
              <ProductEmptyState
                icon={<Database />}
                title="暂无知识库"
                description="创建一个知识库，用来沉淀 PRD、评审材料、方法论和外部报告。"
                action={(
                  <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                    新建知识库
                  </Button>
                )}
              />
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {knowledgeBases.map((kb) => (
                <Card key={kb.id} className={appCardClassName}>
                  <CardHeader className="pb-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {kb.source_type === 'builtin' ? (
                          <Database className="h-4 w-4 text-brand" />
                        ) : (
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        )}
                        <CardTitle className="truncate text-base">{kb.name}</CardTitle>
                      </div>
                      <StatusBadge className="shrink-0" tone={kb.source_type === 'builtin' ? 'brand' : 'neutral'}>
                        {kb.source_type === 'builtin' ? '内置' : '外部'}
                      </StatusBadge>
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
            )}
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

              {searchResults.length === 0 && searchQuery && !isSearching && !errorMessage && (
                <ProductEmptyState
                  icon={<BookOpen />}
                  title="未找到匹配内容"
                  description="当前知识库没有返回相关片段，可以换一个关键词或补充知识材料。"
                  className="min-h-60"
                />
              )}

              {searchResults.length === 0 && !searchQuery && !isSearching && (
                <ProductEmptyState
                  icon={<Search />}
                  title="输入问题开始检索"
                  description="支持关键词或自然语言描述，例如“最近一次竞品分析里的用户痛点”。"
                  className="min-h-60"
                />
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
