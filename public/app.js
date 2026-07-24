const {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  CssBaseline,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme
} = MaterialUI;

const tokenKey = "pos_token";
const userKey = "pos_user";

function getToken() {
  return localStorage.getItem(tokenKey);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(userKey) || "{}");
  } catch (error) {
    return {};
  }
}

function setAuth(token, user) {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
}

function inr(value) {
  return "\u20b9" + Number(value || 0).toFixed(2);
}

function esc(value) {
  return String(value || "");
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function App() {
  const path = window.location.pathname;
  const isLogin = path.endsWith("login.html") || path === "/";
  return isLogin ? <LoginPage /> : <DashboardPage />;
}

function LoginPage() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (getToken()) {
      window.location.href = "/dashboard.html";
    }
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      setAuth(result.token, result.user);
      window.location.href = "/dashboard.html";
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <ThemeRoot>
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(circle at 10% 10%, #d2ecff, transparent 35%), radial-gradient(circle at 90% 0%, #d6f9e4, transparent 30%), #edf4fb"
        }}
      >
        <Paper elevation={8} sx={{ p: 4, width: "min(460px, 92vw)", borderRadius: 4 }}>
          <Stack spacing={2} component="form" onSubmit={submit}>
            <Typography variant="h4" fontWeight={700}>
              Small Shop POS
            </Typography>
            <Typography color="text.secondary">Sign in to continue</Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </Button>
            <Alert severity="info">Default: admin/admin123 or sales/sales123</Alert>
          </Stack>
        </Paper>
      </Box>
    </ThemeRoot>
  );
}

function DashboardPage() {
  const user = getUser();
  const isAdmin = user.role === "admin";
  const [view, setView] = React.useState("pos");

  const [toast, setToast] = React.useState({ open: false, message: "", severity: "success" });

  const [products, setProducts] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [cart, setCart] = React.useState([]);
  const [paymentMethod, setPaymentMethod] = React.useState("Cash");
  const [customerName, setCustomerName] = React.useState("");
  const [shiftReportDate, setShiftReportDate] = React.useState(new Date().toISOString().slice(0, 10));

  const [salesDate, setSalesDate] = React.useState("");
  const [sales, setSales] = React.useState([]);

  const [expenseDate, setExpenseDate] = React.useState("");
  const [expenses, setExpenses] = React.useState([]);
  const [expenseForm, setExpenseForm] = React.useState({ description: "", amount: "", category: "Rent" });

  const [productForm, setProductForm] = React.useState({
    id: "",
    name: "",
    category: "Electronics",
    selling_price: "",
    cost_price: "",
    stock_quantity: ""
  });
  const [importFile, setImportFile] = React.useState(null);
  const [importing, setImporting] = React.useState(false);

  const [dailyDate, setDailyDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [dailySummary, setDailySummary] = React.useState(null);

  const monthStart = React.useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, []);
  const [reportStartDate, setReportStartDate] = React.useState(monthStart);
  const [reportEndDate, setReportEndDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [profitLoss, setProfitLoss] = React.useState(null);

  const pinKey = `pos_pins_${user.username || "guest"}`;
  const [pinnedIds, setPinnedIds] = React.useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(pinKey) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  });

  React.useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login.html";
      return;
    }

    loadProducts();
    loadSales();
    loadExpenses();
    if (isAdmin) {
      loadDailySummary();
      loadProfitLoss();
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem(pinKey, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  const navItems = [
    { key: "pos", label: "POS" },
    { key: "sales", label: "Sales History" },
    ...(isAdmin ? [{ key: "products", label: "Products" }] : []),
    { key: "expenses", label: "Expenses" },
    ...(isAdmin ? [{ key: "reports", label: "Reports" }] : [])
  ];

  const filteredProducts = React.useMemo(() => {
    return products.filter((item) => {
      const s = search.trim().toLowerCase();
      const bySearch = !s || item.name.toLowerCase().includes(s);
      const byCategory = !category || item.category === category;
      return bySearch && byCategory;
    });
  }, [products, search, category]);

  const pinnedProducts = React.useMemo(() => {
    const set = new Set(pinnedIds.map((id) => Number(id)));
    return products.filter((p) => set.has(Number(p.id)));
  }, [products, pinnedIds]);

  const cartTotal = React.useMemo(
    () => cart.reduce((sum, row) => sum + Number(row.unitPrice) * Number(row.quantity), 0),
    [cart]
  );

  function showToast(message, severity = "success") {
    setToast({ open: true, message, severity });
  }

  async function loadProducts() {
    try {
      const data = await apiRequest("/api/products");
      setProducts(data);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function loadSales() {
    try {
      const qs = salesDate ? `?date=${salesDate}` : "";
      const data = await apiRequest(`/api/sales${qs}`);
      setSales(data);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function loadExpenses() {
    try {
      const qs = expenseDate ? `?date=${expenseDate}` : "";
      const data = await apiRequest(`/api/expenses${qs}`);
      setExpenses(data);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function loadDailySummary() {
    try {
      const data = await apiRequest(`/api/reports/daily-summary?date=${dailyDate}`);
      setDailySummary(data);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function loadProfitLoss() {
    try {
      const data = await apiRequest(
        `/api/reports/profit-loss?startDate=${reportStartDate}&endDate=${reportEndDate}`
      );
      setProfitLoss(data);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function togglePin(id) {
    const numericId = Number(id);
    setPinnedIds((prev) =>
      prev.includes(numericId) ? prev.filter((x) => x !== numericId) : [...prev, numericId]
    );
  }

  function addToCart(product) {
    setCart((prev) => {
      const found = prev.find((row) => row.productId === product.id);
      const nextQty = (found ? found.quantity : 0) + 1;
      if (product.category !== "Services" && nextQty > product.stock_quantity) {
        showToast(`Stock not available for ${product.name}`, "error");
        return prev;
      }

      if (found) {
        return prev.map((row) =>
          row.productId === product.id ? { ...row, quantity: row.quantity + 1 } : row
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.selling_price),
          quantity: 1,
          category: product.category
        }
      ];
    });
  }

  function adjustCartQty(productId, diff) {
    const product = products.find((p) => p.id === productId);
    setCart((prev) => {
      return prev
        .map((row) => {
          if (row.productId !== productId) return row;
          const next = row.quantity + diff;
          if (next <= 0) return null;
          if (product && product.category !== "Services" && next > product.stock_quantity) {
            showToast(`Stock not available for ${product.name}`, "error");
            return row;
          }
          return { ...row, quantity: next };
        })
        .filter(Boolean);
    });
  }

  async function completeSale() {
    if (!cart.length) {
      showToast("Cart is empty", "error");
      return;
    }

    try {
      const payload = {
        items: cart.map((row) => ({ productId: row.productId, quantity: row.quantity })),
        paymentMethod,
        customerName
      };
      const result = await apiRequest("/api/sales", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setCart([]);
      setCustomerName("");
      showToast(`Sale complete: ${result.invoiceNumber}`);
      await loadProducts();
      await loadSales();
      if (isAdmin) await loadDailySummary();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function addExpense(event) {
    event.preventDefault();
    try {
      await apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          description: expenseForm.description,
          amount: Number(expenseForm.amount),
          category: expenseForm.category
        })
      });
      showToast("Expense added");
      setExpenseForm({ description: "", amount: "", category: "Rent" });
      await loadExpenses();
      if (isAdmin) await loadDailySummary();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function startEditProduct(p) {
    setProductForm({
      id: p.id,
      name: p.name,
      category: p.category,
      selling_price: p.selling_price,
      cost_price: p.cost_price,
      stock_quantity: p.stock_quantity
    });
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const payload = {
      name: esc(productForm.name).trim(),
      category: productForm.category,
      selling_price: Number(productForm.selling_price),
      cost_price: Number(productForm.cost_price),
      stock_quantity: Number(productForm.stock_quantity)
    };

    try {
      if (productForm.id) {
        await apiRequest(`/api/products/${productForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showToast("Product updated");
      } else {
        await apiRequest("/api/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        showToast("Product added");
      }

      setProductForm({
        id: "",
        name: "",
        category: "Electronics",
        selling_price: "",
        cost_price: "",
        stock_quantity: ""
      });

      await loadProducts();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function sendShiftReport() {
    try {
      const data = await apiRequest("/api/reports/end-shift", {
        method: "POST",
        body: JSON.stringify({ date: shiftReportDate })
      });
      showToast(data.message || "Shift report sent");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function downloadProductsTemplate() {
    try {
      const token = getToken();
      const response = await fetch("/api/products/template", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Failed to download template");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "products_import_template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      showToast("Template downloaded");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function importProductsFromExcel() {
    if (!importFile) {
      showToast("Select an Excel file first", "error");
      return;
    }

    setImporting(true);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append("file", importFile);

      const response = await fetch("/api/products/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Failed to import products");
      }

      showToast(result.message || "Import completed");
      setImportFile(null);
      await loadProducts();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setImporting(false);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login.html";
  }

  return (
    <ThemeRoot>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", background: "#eef4fb" }}>
        <AppBar position="sticky" color="default" elevation={1}>
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h5" fontWeight={700}>
                Small Shop POS
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {esc(user.fullName || user.username)} ({esc(user.role || "staff")})
              </Typography>
            </Box>
            <Button variant="contained" color="secondary" onClick={logout}>
              Logout
            </Button>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3} lg={2.5}>
              <Paper sx={{ p: 1.5, borderRadius: 3 }}>
                <Stack spacing={1}>
                  {navItems.map((item) => (
                    <Button
                      key={item.key}
                      variant={view === item.key ? "contained" : "text"}
                      onClick={() => setView(item.key)}
                      sx={{ justifyContent: "flex-start" }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={9} lg={9.5}>
              {view === "pos" ? (
                <POSView
                  isAdmin={isAdmin}
                  products={products}
                  filteredProducts={filteredProducts}
                  pinnedProducts={pinnedProducts}
                  pinnedIds={pinnedIds}
                  search={search}
                  setSearch={setSearch}
                  category={category}
                  setCategory={setCategory}
                  togglePin={togglePin}
                  addToCart={addToCart}
                  cart={cart}
                  adjustCartQty={adjustCartQty}
                  setCart={setCart}
                  cartTotal={cartTotal}
                  paymentMethod={paymentMethod}
                  setPaymentMethod={setPaymentMethod}
                  customerName={customerName}
                  setCustomerName={setCustomerName}
                  completeSale={completeSale}
                  shiftReportDate={shiftReportDate}
                  setShiftReportDate={setShiftReportDate}
                  sendShiftReport={sendShiftReport}
                />
              ) : null}

              {view === "sales" ? (
                <SalesView
                  sales={sales}
                  salesDate={salesDate}
                  setSalesDate={setSalesDate}
                  loadSales={loadSales}
                />
              ) : null}

              {view === "expenses" ? (
                <ExpensesView
                  expenseDate={expenseDate}
                  setExpenseDate={setExpenseDate}
                  loadExpenses={loadExpenses}
                  expenses={expenses}
                  expenseForm={expenseForm}
                  setExpenseForm={setExpenseForm}
                  addExpense={addExpense}
                />
              ) : null}

              {view === "products" && isAdmin ? (
                <ProductsView
                  products={products}
                  productForm={productForm}
                  setProductForm={setProductForm}
                  saveProduct={saveProduct}
                  startEditProduct={startEditProduct}
                  importFile={importFile}
                  setImportFile={setImportFile}
                  importing={importing}
                  downloadProductsTemplate={downloadProductsTemplate}
                  importProductsFromExcel={importProductsFromExcel}
                />
              ) : null}

              {view === "reports" && isAdmin ? (
                <ReportsView
                  dailyDate={dailyDate}
                  setDailyDate={setDailyDate}
                  dailySummary={dailySummary}
                  loadDailySummary={loadDailySummary}
                  reportStartDate={reportStartDate}
                  setReportStartDate={setReportStartDate}
                  reportEndDate={reportEndDate}
                  setReportEndDate={setReportEndDate}
                  profitLoss={profitLoss}
                  loadProfitLoss={loadProfitLoss}
                />
              ) : null}
            </Grid>
          </Grid>
        </Container>

        <Snackbar
          open={toast.open}
          autoHideDuration={3000}
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        >
          <Alert severity={toast.severity} variant="filled" sx={{ width: "100%" }}>
            {toast.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeRoot>
  );
}

function POSView(props) {
  const {
    filteredProducts,
    pinnedProducts,
    pinnedIds,
    search,
    setSearch,
    category,
    setCategory,
    togglePin,
    addToCart,
    cart,
    adjustCartQty,
    setCart,
    cartTotal,
    paymentMethod,
    setPaymentMethod,
    customerName,
    setCustomerName,
    completeSale,
    shiftReportDate,
    setShiftReportDate,
    sendShiftReport
  } = props;

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2.2, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Point of Sale
        </Typography>
        <Typography color="text.secondary">Pin fast products and build carts quickly.</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" mt={1.5}>
          {pinnedProducts.length ? (
            pinnedProducts.map((p) => (
              <Chip key={p.id} label={p.name} color="success" variant="outlined" onClick={() => addToCart(p)} />
            ))
          ) : (
            <Typography color="text.secondary" variant="body2">
              No pinned items yet.
            </Typography>
          )}
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7.5}>
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                fullWidth
                label="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <FormControl sx={{ minWidth: 180 }}>
                <InputLabel>Category</InputLabel>
                <Select
                  label="Category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="Electronics">Electronics</MenuItem>
                  <MenuItem value="Stationery">Stationery</MenuItem>
                  <MenuItem value="Services">Services</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Grid container spacing={1.5} mt={0.5}>
              {filteredProducts.map((p) => (
                <Grid item xs={12} sm={6} md={4} key={p.id}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="start" spacing={1}>
                        <Typography fontWeight={700}>{p.name}</Typography>
                        <Button
                          size="small"
                          variant={pinnedIds.includes(p.id) ? "contained" : "outlined"}
                          onClick={() => togglePin(p.id)}
                        >
                          Pin
                        </Button>
                      </Stack>
                      <Typography color="success.main" fontWeight={700} mt={0.8}>
                        {inr(p.selling_price)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" mt={0.6}>
                        {p.category} | Stock: {p.stock_quantity}
                      </Typography>
                    </CardContent>
                    <CardActions>
                      <Button fullWidth variant="contained" onClick={() => addToCart(p)}>
                        Add to Cart
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4.5}>
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={700}>
              Current Cart
            </Typography>
            <Stack spacing={1} mt={1}>
              {cart.length ? (
                cart.map((item) => (
                  <Paper key={item.productId} variant="outlined" sx={{ p: 1.2 }}>
                    <Typography fontWeight={600}>{item.productName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.quantity} x {inr(item.unitPrice)} = {inr(item.quantity * item.unitPrice)}
                    </Typography>
                    <Stack direction="row" spacing={1} mt={1}>
                      <Button size="small" onClick={() => adjustCartQty(item.productId, -1)}>
                        -
                      </Button>
                      <Button size="small" onClick={() => adjustCartQty(item.productId, 1)}>
                        +
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => setCart((prev) => prev.filter((x) => x.productId !== item.productId))}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography color="text.secondary">Cart is empty.</Typography>
              )}
            </Stack>

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="h6" fontWeight={700}>
              Total: {inr(cartTotal)}
            </Typography>

            <Stack spacing={1.2} mt={1.2}>
              <FormControl fullWidth>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  label="Payment Method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <MenuItem value="Cash">Cash</MenuItem>
                  <MenuItem value="Card">Card</MenuItem>
                  <MenuItem value="UPI">UPI</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Customer Name (Optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="contained" onClick={completeSale}>
                  Complete Sale
                </Button>
                <Button fullWidth variant="outlined" onClick={() => setCart([])}>
                  Clear Cart
                </Button>
              </Stack>
            </Stack>

            <Divider sx={{ my: 1.5 }} />
            <Typography fontWeight={700}>End of Shift Report</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} mt={1}>
              <TextField
                type="date"
                fullWidth
                value={shiftReportDate}
                onChange={(e) => setShiftReportDate(e.target.value)}
              />
              <Button variant="outlined" onClick={sendShiftReport}>
                Send to Telegram
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function SalesView({ salesDate, setSalesDate, loadSales, sales }) {
  return (
    <Paper sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Sales History
          </Typography>
          <Typography color="text.secondary">Invoices and transaction details</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField type="date" value={salesDate} onChange={(e) => setSalesDate(e.target.value)} />
          <Button variant="outlined" onClick={loadSales}>
            Load
          </Button>
        </Stack>
      </Stack>

      <TableContainer sx={{ mt: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Invoice</TableCell>
              <TableCell>Items</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Payment</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Staff</TableCell>
              <TableCell>Date/Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell>{sale.invoice_number}</TableCell>
                <TableCell>
                  {(sale.items || [])
                    .map((item) => `${item.product_name} (${item.quantity})`)
                    .join(", ")}
                </TableCell>
                <TableCell>{inr(sale.total_amount)}</TableCell>
                <TableCell>{sale.payment_method}</TableCell>
                <TableCell>{sale.customer_name || "-"}</TableCell>
                <TableCell>{sale.staff_name}</TableCell>
                <TableCell>{new Date(sale.timestamp).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function ExpensesView({ expenseDate, setExpenseDate, loadExpenses, expenses, expenseForm, setExpenseForm, addExpense }) {
  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Expense Management
        </Typography>
        <Typography color="text.secondary">Log shift expenses quickly</Typography>

        <Box component="form" onSubmit={addExpense} mt={1.5}>
          <Grid container spacing={1.2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Description"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                inputProps={{ min: 0.01, step: 0.01 }}
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  label="Category"
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, category: e.target.value }))}
                >
                  <MenuItem value="Rent">Rent</MenuItem>
                  <MenuItem value="Utilities">Utilities</MenuItem>
                  <MenuItem value="Supplies">Supplies</MenuItem>
                  <MenuItem value="Salary">Salary</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button type="submit" variant="contained" fullWidth sx={{ height: "100%" }}>
                Add Expense
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.2}>
          <Typography variant="h6" fontWeight={700}>
            Expense List
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
            <Button variant="outlined" onClick={loadExpenses}>
              Load
            </Button>
          </Stack>
        </Stack>

        <TableContainer sx={{ mt: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Description</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Date/Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{inr(row.amount)}</TableCell>
                  <TableCell>{row.staff_name}</TableCell>
                  <TableCell>{new Date(row.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}

function ProductsView({
  products,
  productForm,
  setProductForm,
  saveProduct,
  startEditProduct,
  importFile,
  setImportFile,
  importing,
  downloadProductsTemplate,
  importProductsFromExcel
}) {
  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={700}>
          Bulk Import Products
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          Download the template, fill rows, then import Excel (.xlsx/.xls).
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems="center">
          <Button variant="outlined" onClick={downloadProductsTemplate}>
            Download Template
          </Button>
          <Button variant="outlined" component="label">
            Choose Excel File
            <input
              hidden
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files && event.target.files[0];
                setImportFile(file || null);
              }}
            />
          </Button>
          <Typography color="text.secondary" variant="body2" sx={{ flex: 1 }}>
            {importFile ? importFile.name : "No file selected"}
          </Typography>
          <Button variant="contained" onClick={importProductsFromExcel} disabled={importing}>
            {importing ? "Importing..." : "Import Products"}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Product Management
        </Typography>
        <Typography color="text.secondary">Add or edit products</Typography>

        <Box component="form" onSubmit={saveProduct} mt={1.5}>
          <Grid container spacing={1.2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Product Name"
                value={productForm.name}
                onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  label="Category"
                  value={productForm.category}
                  onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))}
                >
                  <MenuItem value="Electronics">Electronics</MenuItem>
                  <MenuItem value="Stationery">Stationery</MenuItem>
                  <MenuItem value="Services">Services</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Selling Price"
                type="number"
                value={productForm.selling_price}
                onChange={(e) => setProductForm((p) => ({ ...p, selling_price: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Cost Price"
                type="number"
                value={productForm.cost_price}
                onChange={(e) => setProductForm((p) => ({ ...p, cost_price: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Stock"
                type="number"
                value={productForm.stock_quantity}
                onChange={(e) => setProductForm((p) => ({ ...p, stock_quantity: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained">
                  {productForm.id ? "Update Product" : "Add Product"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() =>
                    setProductForm({
                      id: "",
                      name: "",
                      category: "Electronics",
                      selling_price: "",
                      cost_price: "",
                      stock_quantity: ""
                    })
                  }
                >
                  Reset
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Selling Price</TableCell>
                <TableCell>Cost Price</TableCell>
                <TableCell>Stock</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.category}</TableCell>
                  <TableCell>{inr(p.selling_price)}</TableCell>
                  <TableCell>{inr(p.cost_price)}</TableCell>
                  <TableCell>{p.stock_quantity}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => startEditProduct(p)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}

function ReportsView({
  dailyDate,
  setDailyDate,
  dailySummary,
  loadDailySummary,
  reportStartDate,
  setReportStartDate,
  reportEndDate,
  setReportEndDate,
  profitLoss,
  loadProfitLoss
}) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} lg={6}>
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={700}>
            Daily Summary
          </Typography>
          <Stack direction="row" spacing={1} mt={1}>
            <TextField type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
            <Button variant="outlined" onClick={loadDailySummary}>
              Load
            </Button>
          </Stack>
          <Stack spacing={1} mt={2}>
            <StatRow label="Date" value={dailySummary ? dailySummary.date : "-"} />
            <StatRow
              label="Total Sales"
              value={dailySummary ? inr(dailySummary.total_sales) : inr(0)}
            />
            <StatRow
              label="Total Expenses"
              value={dailySummary ? inr(dailySummary.total_expenses) : inr(0)}
            />
            <StatRow
              label="Transactions"
              value={dailySummary ? dailySummary.transactions : 0}
            />
            <StatRow
              label="Cash In Hand"
              value={dailySummary ? inr(dailySummary.cash_in_hand) : inr(0)}
            />
          </Stack>
        </Paper>
      </Grid>

      <Grid item xs={12} lg={6}>
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={700}>
            Profit and Loss
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} mt={1}>
            <TextField
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
            />
            <TextField
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
            />
            <Button variant="outlined" onClick={loadProfitLoss}>
              Generate
            </Button>
          </Stack>
          <Stack spacing={1} mt={2}>
            <StatRow label="Revenue" value={profitLoss ? inr(profitLoss.revenue) : inr(0)} />
            <StatRow label="COGS" value={profitLoss ? inr(profitLoss.cogs) : inr(0)} />
            <StatRow
              label="Gross Profit"
              value={profitLoss ? inr(profitLoss.grossProfit) : inr(0)}
            />
            <StatRow
              label="Total Expenses"
              value={profitLoss ? inr(profitLoss.totalExpenses) : inr(0)}
            />
            <StatRow label="Net Profit" value={profitLoss ? inr(profitLoss.netProfit) : inr(0)} />
            <StatRow
              label="Transactions"
              value={profitLoss ? profitLoss.transactions : 0}
            />
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  );
}

function StatRow({ label, value }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.1, display: "flex", alignItems: "center", justifyContent: "space-between" }}
    >
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={700}>{value}</Typography>
    </Paper>
  );
}

function ThemeRoot({ children }) {
  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: "light",
          primary: { main: "#116ea3" },
          secondary: { main: "#0f8f74" },
          background: { default: "#eef4fb", paper: "#ffffff" }
        },
        typography: {
          fontFamily: "Outfit, Montserrat, sans-serif",
          h4: { fontFamily: "Montserrat, sans-serif" },
          h5: { fontFamily: "Montserrat, sans-serif" },
          h6: { fontFamily: "Montserrat, sans-serif" }
        },
        shape: { borderRadius: 14 }
      }),
    []
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
