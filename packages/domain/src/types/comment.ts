export interface CommentDto {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  authorAvatarKey: string | null;
  parentCommentId: string | null;
  body: string | null;
  isDeleted: boolean;
  canDelete: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CommentThread {
  root: CommentDto;
  replies: CommentDto[];
}
