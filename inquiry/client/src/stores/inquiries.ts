import { create } from 'zustand';
import { inquiriesApi, Inquiry, Resource, ApiError } from '../lib/api';

interface InquiriesState {
  inquiries: Inquiry[];
  selectedId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Actions
  fetchInquiries: () => Promise<void>;
  createInquiry: (title: string, content?: string) => Promise<Inquiry>;
  updateInquiry: (id: string, data: { title?: string; content?: string }) => Promise<void>;
  deleteInquiry: (id: string) => Promise<void>;
  selectInquiry: (id: string | null) => void;
  addResource: (inquiryId: string, resource: { type: 'link' | 'file'; title: string; url?: string; filename?: string; mimeType?: string }) => Promise<Resource>;
  deleteResource: (inquiryId: string, resourceId: string) => Promise<void>;
  clearError: () => void;

  // WebSocket handlers
  handleInquiryCreated: (inquiry: Inquiry) => void;
  handleInquiryUpdated: (inquiry: Inquiry) => void;
  handleInquiryDeleted: (data: { id: string }) => void;
  handleResourceCreated: (data: { inquiryId: string; resource: Resource }) => void;
  handleResourceDeleted: (data: { inquiryId: string; resourceId: string }) => void;
}

export const useInquiriesStore = create<InquiriesState>((set, get) => ({
  inquiries: [],
  selectedId: null,
  isLoading: false,
  isSaving: false,
  error: null,

  fetchInquiries: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await inquiriesApi.list();
      set({ inquiries: response.inquiries, isLoading: false });
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to fetch inquiries';
      set({ isLoading: false, error: message });
    }
  },

  createInquiry: async (title: string, content?: string) => {
    set({ isSaving: true, error: null });
    try {
      const response = await inquiriesApi.create(title, content);
      // Don't add to state here - will be added via WebSocket
      set({ isSaving: false, selectedId: response.inquiry.id });
      return response.inquiry;
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to create inquiry';
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  updateInquiry: async (id: string, data: { title?: string; content?: string }) => {
    set({ isSaving: true, error: null });
    try {
      await inquiriesApi.update(id, data);
      // Don't update state here - will be updated via WebSocket
      set({ isSaving: false });
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to update inquiry';
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  deleteInquiry: async (id: string) => {
    set({ isSaving: true, error: null });
    try {
      await inquiriesApi.delete(id);
      // Don't update state here - will be updated via WebSocket
      const { selectedId } = get();
      if (selectedId === id) {
        set({ selectedId: null });
      }
      set({ isSaving: false });
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to delete inquiry';
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  selectInquiry: (id: string | null) => {
    set({ selectedId: id });
  },

  addResource: async (inquiryId: string, resource) => {
    set({ isSaving: true, error: null });
    try {
      const response = await inquiriesApi.addResource(inquiryId, resource);
      // Don't update state here - will be updated via WebSocket
      set({ isSaving: false });
      return response.resource;
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to add resource';
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  deleteResource: async (inquiryId: string, resourceId: string) => {
    set({ isSaving: true, error: null });
    try {
      await inquiriesApi.deleteResource(inquiryId, resourceId);
      // Don't update state here - will be updated via WebSocket
      set({ isSaving: false });
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to delete resource';
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  // WebSocket handlers
  handleInquiryCreated: (inquiry: Inquiry) => {
    set((state) => {
      // Check if inquiry already exists (prevent duplicates)
      const exists = state.inquiries.some((i) => i.id === inquiry.id);
      if (exists) return state;

      // Add to beginning of list (sorted by updatedAt desc)
      return {
        inquiries: [inquiry, ...state.inquiries],
      };
    });
  },

  handleInquiryUpdated: (inquiry: Inquiry) => {
    set((state) => ({
      inquiries: state.inquiries
        .map((i) => (i.id === inquiry.id ? inquiry : i))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    }));
  },

  handleInquiryDeleted: (data: { id: string }) => {
    set((state) => ({
      inquiries: state.inquiries.filter((i) => i.id !== data.id),
      selectedId: state.selectedId === data.id ? null : state.selectedId,
    }));
  },

  handleResourceCreated: (data: { inquiryId: string; resource: Resource }) => {
    set((state) => ({
      inquiries: state.inquiries.map((inquiry) => {
        if (inquiry.id !== data.inquiryId) return inquiry;

        // Check if resource already exists
        const exists = inquiry.resources.some((r) => r.id === data.resource.id);
        if (exists) return inquiry;

        return {
          ...inquiry,
          resources: [...inquiry.resources, data.resource],
        };
      }),
    }));
  },

  handleResourceDeleted: (data: { inquiryId: string; resourceId: string }) => {
    set((state) => ({
      inquiries: state.inquiries.map((inquiry) => {
        if (inquiry.id !== data.inquiryId) return inquiry;
        return {
          ...inquiry,
          resources: inquiry.resources.filter((r) => r.id !== data.resourceId),
        };
      }),
    }));
  },
}));
