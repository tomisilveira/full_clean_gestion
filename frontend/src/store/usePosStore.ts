import { create } from 'zustand';

export interface CartItem {
  productId: number;
  code: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  stockAvailable: number;
}

export interface PaymentItem {
  paymentMethod: 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'MERCADO_PAGO' | 'CURRENT_ACCOUNT';
  amount: number;
  reference?: string;
}

interface PosState {
  cart: CartItem[];
  selectedCustomerId: number | null;
  selectedCustomerName: string;
  saleType: 'RETAIL' | 'WHOLESALE';
  discount: number;
  payments: PaymentItem[];
  
  // Actions
  addItem: (product: any, quantity?: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
  setCustomer: (id: number | null, name: string) => void;
  setSaleType: (type: 'RETAIL' | 'WHOLESALE') => void;
  setDiscount: (discount: number) => void;
  setPayments: (payments: PaymentItem[]) => void;
  
  // Totals
  getSubtotal: () => number;
  getTotal: () => number;
}

export const usePosStore = create<PosState>((set, get) => ({
  cart: [],
  selectedCustomerId: null,
  selectedCustomerName: 'Consumidor Final',
  saleType: 'RETAIL',
  discount: 0,
  payments: [{ paymentMethod: 'CASH', amount: 0 }],

  addItem: (product, quantity = 1) => {
    const { cart, saleType } = get();
    const existingIndex = cart.findIndex((item) => item.productId === product.id);

    const price = saleType === 'WHOLESALE' ? (product.wholesalePrice || product.salePrice) : product.salePrice;

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      const newQty = updatedCart[existingIndex].quantity + quantity;
      updatedCart[existingIndex].quantity = newQty;
      updatedCart[existingIndex].subtotal = newQty * updatedCart[existingIndex].unitPrice;
      set({ cart: updatedCart });
    } else {
      const newItem: CartItem = {
        productId: product.id,
        code: product.code,
        name: product.name,
        unitPrice: price,
        quantity,
        subtotal: price * quantity,
        stockAvailable: product.currentStock,
      };
      set({ cart: [...cart, newItem] });
    }
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }
    const { cart } = get();
    const updatedCart = cart.map((item) => {
      if (item.productId === productId) {
        return {
          ...item,
          quantity,
          subtotal: quantity * item.unitPrice,
        };
      }
      return item;
    });
    set({ cart: updatedCart });
  },

  removeItem: (productId) => {
    set({ cart: get().cart.filter((item) => item.productId !== productId) });
  },

  clearCart: () => {
    set({
      cart: [],
      selectedCustomerId: null,
      selectedCustomerName: 'Consumidor Final',
      discount: 0,
      payments: [{ paymentMethod: 'CASH', amount: 0 }],
    });
  },

  setCustomer: (id, name) => set({ selectedCustomerId: id, selectedCustomerName: name }),
  setSaleType: (saleType) => {
    const { cart } = get();
    set({ saleType });
    // Recalculate cart items prices based on new saleType
    if (cart.length > 0) {
      // Keep existing unitPrices or reset
    }
  },
  setDiscount: (discount) => set({ discount }),
  setPayments: (payments) => set({ payments }),

  getSubtotal: () => get().cart.reduce((sum, item) => sum + item.subtotal, 0),
  getTotal: () => Math.max(0, get().getSubtotal() - get().discount),
}));
