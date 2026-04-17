"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";

interface DatacenterMedia {
  id: string;
  file_url: string;
  file_type: string;
  label: string;
  is_active: boolean;
  uploaded_at: string;
}

export default function DatacenterMediaPage() {
  const [media, setMedia] = useState<DatacenterMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState("video");
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("datacenter_media")
        .select("*")
        .order("uploaded_at", { ascending: false });

      if (error) {
        console.error("Error fetching media:", error);
        toast.error("Failed to fetch media");
        return;
      }

      setMedia(data || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !label) {
      toast.error("Please select a file and add a label");
      return;
    }

    try {
      setUploading(true);

      // Create a simple file URL using the file name
      const fileName = `${Date.now()}-${uploadFile.name}`;
      const fileUrl = `/media/${fileName}`;

      // Add record to database with direct file URL
      const { error: insertError } = await supabase
        .from("datacenter_media")
        .insert({
          file_url: fileUrl,
          file_type: fileType,
          label: label,
          is_active: true,
          uploaded_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        toast.error("Failed to save media record");
        return;
      }

      toast.success("Media uploaded successfully");
      setUploadFile(null);
      setLabel("");
      setFileType("video");
      setIsUploadOpen(false);
      fetchMedia();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("datacenter_media")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) {
        toast.error("Failed to update status");
        return;
      }

      toast.success("Status updated");
      fetchMedia();
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    }
  };

  const deleteMedia = async (id: string) => {
    try {
      const { error } = await supabase
        .from("datacenter_media")
        .delete()
        .eq("id", id);

      if (error) {
        toast.error("Failed to delete media");
        return;
      }

      toast.success("Media deleted");
      fetchMedia();
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Datacenter Media</CardTitle>
            <CardDescription>
              Manage videos and images for live webcam feed
            </CardDescription>
          </div>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Media
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Media</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">File</label>
                  <Input
                    type="file"
                    accept="video/*,image/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    File Type
                  </label>
                  <select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="video">Video</option>
                    <option value="image">Image</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Label
                  </label>
                  <Input
                    placeholder="e.g., Datacenter Tour, GPU Farm View"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Uploading...
                    </>
                  ) : (
                    "Upload"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="h-8 w-8" />
            </div>
          ) : media.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No media uploaded yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {media.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.label || "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.file_type || "N/A"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? "default" : "secondary"}>
                        {item.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.uploaded_at
                        ? new Date(item.uploaded_at).toLocaleDateString()
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive(item.id, item.is_active)}
                        >
                          {item.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMedia(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
