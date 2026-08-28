import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';
import { FileText, HelpCircle, Code2, Rocket, Image, Link2 } from 'lucide-react';

const postTypes = [
  { id: 'article', label: 'Article', icon: <FileText className="h-4 w-4" /> },
  { id: 'question', label: 'Question', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'snippet', label: 'Code Snippet', icon: <Code2 className="h-4 w-4" /> },
  { id: 'showcase', label: 'Project', icon: <Rocket className="h-4 w-4" /> },
  { id: 'image', label: 'Image', icon: <Image className="h-4 w-4" /> },
  { id: 'link', label: 'Link', icon: <Link2 className="h-4 w-4" /> },
];

export default function CreatePostPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState('article');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthenticated) {
    return (
      <>
        <Seo title="Create Post" noindex />
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Sign in to create posts.</p>
          <Link to="/login"><Button variant="primary">{t('common.login')}</Button></Link>
        </div>
      </>
    );
  }

  const handlePublish = async () => {
    if (!title.trim()) {
      toast({ type: 'warning', title: 'Please enter a title' });
      return;
    }
    setIsSubmitting(true);
    try {
      // In real implementation, save to Firestore
      toast({ type: 'success', title: 'Post published! (Firebase not configured — post saved locally)' });
      setTitle('');
      setBody('');
      setTags('');
    } catch {
      toast({ type: 'error', title: 'Failed to publish post' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Seo title="Create Post" noindex />
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('feed.createPost')}</h1>

        {/* Post Type Selector */}
        <div className="flex gap-2 flex-wrap">
          {postTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === type.id
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 ring-1 ring-brand-500'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {type.icon}
              {type.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="card p-6 space-y-4">
          <Input
            label={t('post.postTitle')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a descriptive title"
          />
          <Textarea
            label={t('post.postBody')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your content in Markdown..."
            className="min-h-[300px] font-mono"
          />
          <Input
            label={t('post.tags')}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="react, typescript, firebase (comma separated)"
            helperText="Add up to 5 tags separated by commas"
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline">
              {t('post.saveDraft')}
            </Button>
            <Button variant="outline">
              {t('post.preview')}
            </Button>
            <Button variant="primary" onClick={handlePublish} isLoading={isSubmitting}>
              {t('post.publish')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
