// src/features/editor/components/EditorHeader.tsx

import { type ReactNode, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';

// State Management
import { useUIStore } from '@/core/state/uiStore';
import { useAppStore } from '@/core/state/useAppStore';
import { type AppStore } from '@/core/state/useAppStore';

// UI Components & Icons
import { Button } from '@/core/components/ui/button';
import { Eye, PanelLeft, UploadCloud, PanelRight } from 'lucide-react';
import { toast } from 'sonner';

// Services
import { exportSiteToZip } from '@/core/services/siteExporter.service';
import { slugify } from '@/core/libraries/utils';

/**
 * Props for the generic EditorHeader component.
 */
interface EditorHeaderProps {
  /**
   * An optional React node containing action buttons or other components
   * to be displayed in the header. This allows for context-specific actions,
   * such as the "Save" button in the content editor.
   */
  actions?: ReactNode;
}

export default function EditorHeader({ actions }: EditorHeaderProps) {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [isPublishing, setIsPublishing] = useState(false);

  // Get site and UI state from the global stores
  const site = useAppStore(useCallback((state: AppStore) => state.getSiteById(siteId), [siteId]));
  const { toggleLeftSidebar, toggleRightSidebar, isLeftAvailable, isRightAvailable } = useUIStore((state) => state.sidebar);

  const handlePublishSite = async () => {
    if (!site) {
      toast.error("Site data not found. Cannot publish.");
      return;
    }
    setIsPublishing(true);
    toast.info("Generating site bundle for download...");
    try {
      const blob = await exportSiteToZip(site);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${slugify(site.manifest.title || 'signum-site')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success("Site bundle downloaded!");
    } catch (error) {
      console.error("Error publishing site to Zip:", error);
      toast.error(`Failed to generate Zip: ${(error as Error).message}`);
    } finally {
      setIsPublishing(false);
    }
  };
  
  // Render a placeholder header if site data isn't loaded yet
  if (!site) {
    return (
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-4 border-b bg-background px-4 lg:h-[60px]">
          {/* A simple loading state to prevent layout shift */}
          <div className="flex-1 text-lg text-muted-foreground">Loading...</div>
        </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 flex shrink-0 items-center gap-4 border-b bg-background lg:pl-4 pr-4 h-[60px]">
      <div className="flex items-center gap-2">
        {/*
          This button is only visible if the corresponding sidebar has been
          made "available" by the page layout (e.g., EditContentPage).
        */}
        {isLeftAvailable && (
            <Button 
                variant="outline" 
                size="icon" 
                className="shrink-0" 
                onClick={toggleLeftSidebar}
                aria-label="Toggle file tree"
            >
                <PanelLeft className="h-5 w-5" />
            </Button>
        )}
      </div>

      {/* Displays the site title */}
      <div className="flex-1 text-lg text-muted-foreground truncate">
       <span className="font-bold text-foreground">{site.manifest.title}</span>
      </div>
      
      <div className="flex items-center justify-end gap-2">
        {/*
          This renders the context-specific actions passed via props.
          For the main editor, this will be the SaveButton. For settings pages,
          this will be null.
        */}
        {actions}

        <Button variant="outline" asChild>
            {/* The "View" link now correctly points to the hash-based route */}
            <Link to={`/sites/${siteId}/view`}>
                <Eye className="h-4 w-4" />
                <span className='hidden md:block ml-2'>View</span>
            </Link>
        </Button>
        <Button variant="default" onClick={handlePublishSite} disabled={isPublishing}>
            <UploadCloud className="h-4 w-4" /> 
            <span className='hidden md:block ml-2'>{isPublishing ? 'Publishing...' : 'Publish'}</span>
        </Button>

        {/* The right sidebar toggle button */}
        {isRightAvailable && (
            <Button 
                variant="outline" 
                size="icon" 
                className="shrink-0" 
                onClick={toggleRightSidebar}
                aria-label="Toggle settings sidebar"
            >
                <PanelRight className="h-5 w-5" />
            </Button>
        )}
      </div>
    </header>
  );
}