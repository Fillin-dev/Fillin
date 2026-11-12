import { SnippetService } from './SnippetService';
import { snippetRepository } from '../storage/repository';

export const snippetService = new SnippetService(snippetRepository);
