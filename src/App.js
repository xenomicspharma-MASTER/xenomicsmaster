import React, { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import {
  Activity,
  LogOut,
  Database,
  FileText,
  BarChart3,
  Users,
  Upload,
  Edit,
  CheckCircle,
  Clock,
  Download,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAxW4xYfl4LJUUe4s5oxnpWOw4QzphjKtk",
  authDomain: "xenomics-ec3c4.firebaseapp.com",
  projectId: "xenomics-ec3c4",
  storageBucket: "xenomics-ec3c4.firebasestorage.app",
  messagingSenderId: "12294894672",
  appId: "1:12294894672:web:63ee04beff79d1aa800d55",
};

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState(null);
  const [appState, setAppState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("");
  const [uploading, setUploading] = useState(false);

  // Data States
  const [products, setProducts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [stockists, setStockists] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [sales, setSales] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Form States
  const [newItem, setNewItem] = useState({
    code: "",
    name: "",
    mrp: "",
    nrv: "",
    batchNo: "",
    empCode: "",
  });
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    code: "",
    role: "employee",
  });
  const [editingUser, setEditingUser] = useState(null);
  const [editingSale, setEditingSale] = useState(null);

  // Excel Export Date Range Filters
  const [exportFilter, setExportFilter] = useState({
    fromMonth: "January",
    fromYear: new Date().getFullYear().toString(),
    toMonth: "December",
    toYear: new Date().getFullYear().toString(),
  });

  const [saleEntry, setSaleEntry] = useState({
    year: new Date().getFullYear().toString(),
    month: "January",
    doctorId: "",
    stockistId: "",
    pharmacyId: "",
    productId: "",
    batchNo: "",
    saleQty: 0,
    freeQty: 0,
    discount: 0,
  });

  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const YEARS = Array.from({ length: 5 }, (_, i) =>
    (new Date().getFullYear() - 2 + i).toString()
  );

  // Authentication & Role Routing
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        const q = query(
          collection(db, "users"),
          where("email", "==", currentUser.email)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDocRef = doc(db, "users", querySnapshot.docs[0].id);
          let userData = querySnapshot.docs[0].data();

          if (!userData.uid) {
            await updateDoc(userDocRef, { uid: currentUser.uid });
            userData.uid = currentUser.uid;
          }

          setAppState(userData);
          setActiveTab(userData.role === "admin" ? "reports" : "sales");
        } else {
          const isAdminUser = currentUser.email === "xenomicspharma@gmail.com";
          const newUserData = {
            role: isAdminUser ? "admin" : "employee",
            name: currentUser.displayName || "Employee",
            email: currentUser.email,
            uid: currentUser.uid,
            code: "",
            approved: isAdminUser, // Admins auto-approved, employees need approval
            canEditSales: false,
          };
          await addDoc(collection(db, "users"), newUserData);
          setAppState(newUserData);
          setActiveTab(isAdminUser ? "reports" : "sales");
        }
      } else {
        setUser(null);
        setAppState(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Master Data
  useEffect(() => {
    if (!user || !appState) return;
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) =>
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubDoctors = onSnapshot(collection(db, "doctors"), (snap) =>
      setDoctors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubStockists = onSnapshot(collection(db, "stockists"), (snap) =>
      setStockists(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubPharmacies = onSnapshot(collection(db, "pharmacies"), (snap) =>
      setPharmacies(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) =>
      setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsubSales = onSnapshot(collection(db, "sales"), (snap) => {
      let fetchedSales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (appState.role === "employee") {
        fetchedSales = fetchedSales.filter((s) => s.employeeUid === user.uid);
      }
      fetchedSales.sort(
        (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)
      );
      setSales(fetchedSales);
    });

    return () => {
      unsubProducts();
      unsubDoctors();
      unsubStockists();
      unsubPharmacies();
      unsubSales();
      unsubUsers();
    };
  }, [user, appState]);

  // --- APPROVAL & PERMISSION HANDLERS ---
  const handleToggleApproval = async (userId, currentStatus) => {
    try {
      await updateDoc(doc(db, "users", userId), { approved: !currentStatus });
      alert("User approval status updated!");
    } catch (err) {
      alert("Error updating approval: " + err.message);
    }
  };

  const handleToggleEditPermission = async (userId, currentStatus) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        canEditSales: !currentStatus,
      });
      alert("Employee edit permission updated!");
    } catch (err) {
      alert("Error updating edit permission: " + err.message);
    }
  };

  // --- MULTI-SHEET EXCEL UPLOAD HANDLER ---
  const handleBulkExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: "array" });
        let totalCount = 0;

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          let collectionName = sheetName.toLowerCase();

          for (const row of json) {
            const code = row.Code || row.code;
            const name = row.Name || row.name;
            const email = row.Email || row.email;
            const empCode = row.EmpCode || row.empCode || row["Emp Code"];

            if (collectionName === "employees" && email && code) {
              const q = query(
                collection(db, "users"),
                where("email", "==", email.trim())
              );
              const querySnapshot = await getDocs(q);

              if (!querySnapshot.empty) {
                const userDocId = querySnapshot.docs[0].id;
                const updateData = { code: String(code) };
                if (name) updateData.name = String(name);
                await updateDoc(doc(db, "users", userDocId), updateData);
              } else {
                await addDoc(collection(db, "users"), {
                  name: name ? String(name) : "",
                  email: email.trim(),
                  code: String(code),
                  role: "employee",
                  uid: "",
                  approved: true,
                  canEditSales: false,
                });
              }
              totalCount++;
            } else if (collectionName !== "employees" && code && name) {
              const docData = { code: String(code), name: String(name) };
              if (collectionName === "products") {
                docData.mrp = Number(row.MRP || row.mrp || 0);
                docData.nrv = Number(row.NRV || row.nrv || 0);
                docData.batchNo = row["Batch No"] || row.batchNo || "";
              }
              if (
                collectionName === "doctors" ||
                collectionName === "pharmacies"
              ) {
                docData.empCode = empCode ? String(empCode) : "";
              }
              await addDoc(collection(db, collectionName), docData);
              totalCount++;
            }
          }
        }
        alert(`Successfully processed ${totalCount} items from Excel!`);
      } catch (err) {
        alert(
          "Error parsing Excel file. Please ensure it matches the template."
        );
      }
      setUploading(false);
      e.target.value = null;
    };
    reader.readAsArrayBuffer(file);
  };

  // --- EXCEL DOWNLOAD EXPORT ---
  const handleExportFilteredSalesToExcel = () => {
    const fromMonthIdx = MONTHS.indexOf(exportFilter.fromMonth);
    const toMonthIdx = MONTHS.indexOf(exportFilter.toMonth);
    const fromY = parseInt(exportFilter.fromYear);
    const toY = parseInt(exportFilter.toYear);

    const filtered = sales.filter((s) => {
      const sMonthIdx = MONTHS.indexOf(s.month);
      const sY = parseInt(s.year);

      const sDateVal = sY * 12 + sMonthIdx;
      const fromVal = fromY * 12 + fromMonthIdx;
      const toVal = toY * 12 + toMonthIdx;

      return sDateVal >= fromVal && sDateVal <= toVal;
    });

    if (filtered.length === 0)
      return alert("No sales data found for the selected date range.");

    const exportData = filtered.map((s) => ({
      Year: s.year,
      Month: s.month,
      "Employee Code": s.employeeCode || "",
      "Employee Name": s.employeeName || "",
      "Doctor Name": s.doctorName || "",
      "Stockist Name": s.stockistName || "",
      "Pharmacy Name": s.pharmacyName || "",
      "Product Code": s.productCode || "",
      "Product Name": s.productName || "",
      "Batch No": s.batchNo || "",
      "Sale Qty": s.saleQty,
      "Free Qty": s.freeQty,
      "Discount (₹)": s.discount || 0,
      "Total Value (₹)": s.saleValue,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Report");
    XLSX.writeFile(
      workbook,
      `Xenomics_Sales_${exportFilter.fromMonth}_${exportFilter.fromYear}_to_${exportFilter.toMonth}_${exportFilter.toYear}.xlsx`
    );
  };

  // --- MANUAL DATA ENTRY HANDLERS ---
  const handleAddEmployee = async () => {
    if (!newEmployee.email) return alert("Email is required.");
    try {
      await addDoc(collection(db, "users"), {
        name: newEmployee.name,
        email: newEmployee.email.trim(),
        code: newEmployee.code,
        role: newEmployee.role,
        uid: "",
        approved: true,
        canEditSales: false,
      });
      setNewEmployee({ name: "", email: "", code: "", role: "employee" });
      alert("Employee added successfully!");
    } catch (err) {
      alert("Error adding employee: " + err.message);
    }
  };

  const handleSaveUserEdit = async () => {
    try {
      await updateDoc(doc(db, "users", editingUser.id), {
        name: editingUser.name,
        code: editingUser.code,
        role: editingUser.role,
      });
      setEditingUser(null);
      alert("Employee details updated!");
    } catch (err) {
      alert("Error updating employee: " + err.message);
    }
  };

  const handleAddMasterData = async (collectionName) => {
    if (!newItem.name || !newItem.code)
      return alert("Code and Name are required.");
    try {
      const data = { code: newItem.code, name: newItem.name };
      if (collectionName === "products") {
        data.mrp = Number(newItem.mrp || 0);
        data.nrv = Number(newItem.nrv || 0);
        data.batchNo = newItem.batchNo || "";
      }
      if (collectionName === "doctors" || collectionName === "pharmacies") {
        data.empCode = newItem.empCode || "";
      }
      await addDoc(collection(db, collectionName), data);
      setNewItem({
        code: "",
        name: "",
        mrp: "",
        nrv: "",
        batchNo: "",
        empCode: "",
      });
    } catch (error) {
      alert("Error adding data: " + error.message);
    }
  };

  const handleSaleSubmit = async (e) => {
    e.preventDefault();
    const product = products.find((p) => p.id === saleEntry.productId);
    const doctor = doctors.find((d) => d.id === saleEntry.doctorId);
    const stockist = stockists.find((s) => s.id === saleEntry.stockistId);
    const pharmacy = pharmacies.find((p) => p.id === saleEntry.pharmacyId);

    if (!product || !doctor || !stockist || !pharmacy)
      return alert("Please select all mandatory fields.");

    const saleValue =
      product.nrv * Number(saleEntry.saleQty) - Number(saleEntry.discount);

    try {
      if (editingSale) {
        await updateDoc(doc(db, "sales", editingSale.id), {
          ...saleEntry,
          productName: product.name,
          productCode: product.code,
          doctorName: doctor.name,
          stockistName: stockist.name,
          pharmacyName: pharmacy.name,
          mrp: product.mrp,
          nrv: product.nrv,
          saleValue: saleValue,
        });
        alert(`Sale entry updated successfully!`);
        setEditingSale(null);
      } else {
        await addDoc(collection(db, "sales"), {
          ...saleEntry,
          employeeName: appState.name,
          employeeCode: appState.code,
          employeeUid: appState.uid,
          productName: product.name,
          productCode: product.code,
          doctorName: doctor.name,
          stockistName: stockist.name,
          pharmacyName: pharmacy.name,
          mrp: product.mrp,
          nrv: product.nrv,
          saleValue: saleValue,
          timestamp: new Date(),
        });
        alert(
          `Sale entry saved successfully! Final Value: ₹${saleValue.toFixed(2)}`
        );
      }
      setSaleEntry({
        ...saleEntry,
        saleQty: 0,
        freeQty: 0,
        discount: 0,
        batchNo: "",
        productId: "",
      });
    } catch (error) {
      alert("Error saving sale: " + error.message);
    }
  };

  const handleStartEditSale = (sale) => {
    setEditingSale(sale);
    setSaleEntry({
      year: sale.year,
      month: sale.month,
      doctorId: sale.doctorId || "",
      stockistId: sale.stockistId || "",
      pharmacyId: sale.pharmacyId || "",
      productId: sale.productId || "",
      batchNo: sale.batchNo || "",
      saleQty: sale.saleQty,
      freeQty: sale.freeQty,
      discount: sale.discount,
    });
    setActiveTab("sales");
  };

  if (loading)
    return (
      <div style={{ padding: "50px", textAlign: "center" }}>
        Loading Xenomics Portal...
      </div>
    );

  if (!user) {
    return (
      <div
        style={{
          maxWidth: "400px",
          margin: "100px auto",
          padding: "30px",
          border: "1px solid #e0e0e0",
          borderRadius: "12px",
          fontFamily: "sans-serif",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}
      >
        <h2
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "#1a365d",
          }}
        >
          <Activity size={28} /> Xenomics Portal
        </h2>
        <p style={{ color: "#4a5568", marginBottom: "25px" }}>
          Secure sales tracking system
        </p>
        <button
          onClick={() => signInWithPopup(auth, googleProvider)}
          style={{
            width: "100%",
            padding: "12px",
            background: "#4285F4",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  // Check if Employee is Approved by Admin
  if (appState && !appState.approved && appState.role !== "admin") {
    return (
      <div
        style={{
          maxWidth: "500px",
          margin: "100px auto",
          padding: "30px",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          fontFamily: "sans-serif",
          textAlign: "center",
          boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
          background: "white",
        }}
      >
        <Clock size={48} color="#d69e2e" style={{ marginBottom: "15px" }} />
        <h2 style={{ color: "#2d3748", margin: "0 0 10px 0" }}>
          Account Pending Approval
        </h2>
        <p
          style={{ color: "#718096", marginBottom: "25px", lineHeight: "1.5" }}
        >
          Your account (<strong>{user.email}</strong>) is registered. Please
          wait for the Admin to review and approve your account before you can
          access the sales portal.
        </p>
        <button
          onClick={() => signOut(auth)}
          style={{
            padding: "10px 20px",
            background: "#e53e3e",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Logout & Switch Account
        </button>
      </div>
    );
  }

  const isAdmin = appState?.role === "admin";
  const myDoctors = isAdmin
    ? doctors
    : doctors.filter((d) => d.empCode === appState?.code);
  const myPharmacies = isAdmin
    ? pharmacies
    : pharmacies.filter((p) => p.empCode === appState?.code);

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "2px solid #e2e8f0",
          paddingBottom: "20px",
          marginBottom: "20px",
        }}
      >
        <h1
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "#2b6cb0",
            margin: 0,
          }}
        >
          <Activity size={32} /> Xenomics Pharma
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <span style={{ color: "#4a5568" }}>
            {appState?.name} {appState?.code ? `[${appState.code}]` : ""}
            <strong style={{ color: isAdmin ? "#c53030" : "#2f855a" }}>
              {" "}
              ({appState?.role.toUpperCase()})
            </strong>
          </span>

          {isAdmin && (
            <button
              onClick={() =>
                setActiveTab(activeTab === "sales" ? "reports" : "sales")
              }
              style={{
                padding: "6px 12px",
                background: "#3182ce",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "bold",
              }}
            >
              Switch to{" "}
              {activeTab === "sales" ? "Admin Reports" : "Sales Entry View"}
            </button>
          )}

          <button
            onClick={() => signOut(auth)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "8px 16px",
              background: "#e53e3e",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      {/* NAVIGATION */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "30px" }}>
        {(isAdmin || activeTab === "sales") && (
          <button
            onClick={() => setActiveTab("sales")}
            style={tabStyle(activeTab === "sales")}
          >
            <FileText size={18} /> Sales Entry
          </button>
        )}
        <button
          onClick={() => setActiveTab("reports")}
          style={tabStyle(activeTab === "reports")}
        >
          <BarChart3 size={18} /> {isAdmin ? "Team Reports" : "My Reports"}
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab("master")}
            style={tabStyle(activeTab === "master")}
          >
            <Database size={18} /> Master Data
          </button>
        )}
      </div>

      {/* SALES ENTRY TAB */}
      {activeTab === "sales" && (
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>
            {editingSale ? "Edit Sale Entry" : "New Sale Entry"}
          </h2>

          {editingSale && (
            <div
              style={{
                padding: "10px",
                background: "#feebc8",
                color: "#744210",
                marginBottom: "20px",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                <strong>Editing Mode:</strong> Modifying previous sale entry.
              </span>
              <button
                onClick={() => {
                  setEditingSale(null);
                  setSaleEntry({
                    year: new Date().getFullYear().toString(),
                    month: "January",
                    doctorId: "",
                    stockistId: "",
                    pharmacyId: "",
                    productId: "",
                    batchNo: "",
                    saleQty: 0,
                    freeQty: 0,
                    discount: 0,
                  });
                }}
                style={{
                  background: "#c05621",
                  color: "white",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel Edit
              </button>
            </div>
          )}

          <form
            onSubmit={handleSaleSubmit}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            <div>
              <label style={labelStyle}>Year</label>
              <select
                style={inputStyle}
                value={saleEntry.year}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, year: e.target.value })
                }
                required
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Month</label>
              <select
                style={inputStyle}
                value={saleEntry.month}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, month: e.target.value })
                }
                required
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Doctor</label>
              <select
                style={inputStyle}
                value={saleEntry.doctorId}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, doctorId: e.target.value })
                }
                required
              >
                <option value="">Select Doctor...</option>
                {myDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.code}] {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Stockist</label>
              <select
                style={inputStyle}
                value={saleEntry.stockistId}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, stockistId: e.target.value })
                }
                required
              >
                <option value="">Select Stockist...</option>
                {stockists.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Pharmacy</label>
              <select
                style={inputStyle}
                value={saleEntry.pharmacyId}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, pharmacyId: e.target.value })
                }
                required
              >
                <option value="">Select Pharmacy...</option>
                {myPharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Product</label>
              <select
                style={inputStyle}
                value={saleEntry.productId}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, productId: e.target.value })
                }
                required
              >
                <option value="">Select Product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name} (MRP: ₹{p.mrp} | NRV: ₹{p.nrv})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Batch No (Optional)</label>
              <input
                type="text"
                placeholder="Enter Batch No"
                style={inputStyle}
                value={saleEntry.batchNo}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, batchNo: e.target.value })
                }
              />
            </div>
            <div>
              <label style={labelStyle}>Discount (₹) Amount</label>
              <input
                type="number"
                min="0"
                placeholder="Total ₹ Discount"
                style={inputStyle}
                value={saleEntry.discount}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, discount: e.target.value })
                }
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Sale Qty</label>
              <input
                type="number"
                min="0"
                style={inputStyle}
                value={saleEntry.saleQty}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, saleQty: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Free Qty</label>
              <input
                type="number"
                min="0"
                style={inputStyle}
                value={saleEntry.freeQty}
                onChange={(e) =>
                  setSaleEntry({ ...saleEntry, freeQty: e.target.value })
                }
                required
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "#38a169",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {editingSale ? "Update Sale Entry" : "Submit Sale Entry"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MASTER DATA TAB (ADMIN ONLY) */}
      {activeTab === "master" && isAdmin && (
        <div>
          {uploading && (
            <div
              style={{
                padding: "10px",
                background: "#fefcbf",
                color: "#975a16",
                marginBottom: "20px",
                borderRadius: "4px",
                fontWeight: "bold",
              }}
            >
              Processing Workbook... Please wait.
            </div>
          )}

          <div
            style={{
              ...cardStyle,
              marginBottom: "20px",
              background: "#ebf8ff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3>
                <Users size={20} style={{ verticalAlign: "middle" }} /> Employee
                Approvals & Management
              </h3>
              <label
                style={{
                  ...actionBtnStyle,
                  background: "#4299e1",
                  display: "inline-block",
                  width: "auto",
                }}
              >
                <Upload
                  size={16}
                  style={{ verticalAlign: "middle", marginRight: "5px" }}
                />{" "}
                Bulk Excel Upload
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  style={{ display: "none" }}
                  onChange={handleBulkExcelUpload}
                />
              </label>
            </div>

            {editingUser && (
              <div
                style={{
                  padding: "15px",
                  background: "#fff5f5",
                  border: "1px solid #fc8181",
                  borderRadius: "8px",
                  margin: "15px 0",
                }}
              >
                <h4 style={{ margin: "0 0 10px 0", color: "#c53030" }}>
                  Edit Details for: {editingUser.email}
                </h4>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={editingUser.name}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, name: e.target.value })
                    }
                    placeholder="Employee Name"
                  />
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={editingUser.code}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, code: e.target.value })
                    }
                    placeholder="Emp Code"
                  />
                  <select
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={editingUser.role}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, role: e.target.value })
                    }
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleSaveUserEdit}
                    style={{
                      ...actionBtnStyle,
                      width: "auto",
                      background: "#e53e3e",
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
                    style={{
                      ...actionBtnStyle,
                      width: "auto",
                      background: "#a0aec0",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: "10px",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr style={{ background: "#bee3f8", textAlign: "left" }}>
                  <th style={thStyle}>Emp Code</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Edit Permission</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: "white",
                    }}
                  >
                    <td style={tdStyle}>
                      <strong>{u.code || "Unassigned"}</strong>
                    </td>
                    <td style={tdStyle}>{u.name}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleToggleApproval(u.id, u.approved)}
                        style={{
                          padding: "4px 8px",
                          background: u.approved ? "#c6f6d5" : "#feebc8",
                          color: u.approved ? "#22543d" : "#744210",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontWeight: "bold",
                          fontSize: "12px",
                        }}
                      >
                        {u.approved ? "Approved" : "Approve User"}
                      </button>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() =>
                          handleToggleEditPermission(u.id, u.canEditSales)
                        }
                        style={{
                          padding: "4px 8px",
                          background: u.canEditSales ? "#bee3f8" : "#edf2f7",
                          color: u.canEditSales ? "#2b6cb0" : "#4a5568",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        {u.canEditSales
                          ? "Allowed to Edit"
                          : "Grant Edit Rights"}
                      </button>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => setEditingUser(u)}
                        style={{
                          padding: "5px 10px",
                          background: "#edf2f7",
                          border: "1px solid #cbd5e0",
                          borderRadius: "4px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <Edit size={14} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            <div style={cardStyle}>
              <h3>Add Single Employee</h3>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  placeholder="Code (e.g. EMP001)"
                  style={{ ...inputStyle, width: "30%" }}
                  value={newEmployee.code}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, code: e.target.value })
                  }
                />
                <input
                  placeholder="Name"
                  style={{ ...inputStyle, width: "70%" }}
                  value={newEmployee.name}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, name: e.target.value })
                  }
                />
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  placeholder="Email (Gmail required)"
                  style={{ ...inputStyle, width: "60%" }}
                  value={newEmployee.email}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, email: e.target.value })
                  }
                />
                <select
                  style={{ ...inputStyle, width: "40%" }}
                  value={newEmployee.role}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, role: e.target.value })
                  }
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button onClick={handleAddEmployee} style={actionBtnStyle}>
                Add Employee
              </button>
            </div>

            <div style={cardStyle}>
              <h3>Add Single Product</h3>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  placeholder="Code"
                  style={{ ...inputStyle, width: "30%" }}
                  value={newItem.code}
                  onChange={(e) =>
                    setNewItem({ ...newItem, code: e.target.value })
                  }
                />
                <input
                  placeholder="Product Name"
                  style={{ ...inputStyle, width: "70%" }}
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                />
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  placeholder="Batch (Opt)"
                  style={{ ...inputStyle, width: "33%" }}
                  value={newItem.batchNo}
                  onChange={(e) =>
                    setNewItem({ ...newItem, batchNo: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="MRP"
                  style={{ ...inputStyle, width: "33%" }}
                  value={newItem.mrp}
                  onChange={(e) =>
                    setNewItem({ ...newItem, mrp: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="NRV"
                  style={{ ...inputStyle, width: "33%" }}
                  value={newItem.nrv}
                  onChange={(e) =>
                    setNewItem({ ...newItem, nrv: e.target.value })
                  }
                />
              </div>
              <button
                onClick={() => handleAddMasterData("products")}
                style={actionBtnStyle}
              >
                Add Product
              </button>
            </div>

            <div style={cardStyle}>
              <h3>Add Single Doctor</h3>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  placeholder="Dr. Code"
                  style={{ ...inputStyle, width: "30%" }}
                  value={newItem.code}
                  onChange={(e) =>
                    setNewItem({ ...newItem, code: e.target.value })
                  }
                />
                <input
                  placeholder="Dr. Name"
                  style={{ ...inputStyle, width: "70%" }}
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                />
              </div>
              <input
                placeholder="Assign to EmpCode (e.g. EMP001)"
                style={inputStyle}
                value={newItem.empCode}
                onChange={(e) =>
                  setNewItem({ ...newItem, empCode: e.target.value })
                }
              />
              <button
                onClick={() => handleAddMasterData("doctors")}
                style={actionBtnStyle}
              >
                Add Doctor
              </button>
            </div>

            <div style={cardStyle}>
              <h3>Add Single Stockist</h3>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  placeholder="Stockist Code"
                  style={{ ...inputStyle, width: "30%" }}
                  value={newItem.code}
                  onChange={(e) =>
                    setNewItem({ ...newItem, code: e.target.value })
                  }
                />
                <input
                  placeholder="Stockist Name"
                  style={{ ...inputStyle, width: "70%" }}
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                />
              </div>
              <button
                onClick={() => handleAddMasterData("stockists")}
                style={actionBtnStyle}
              >
                Add Stockist
              </button>
            </div>

            <div style={cardStyle}>
              <h3>Add Single Pharmacy</h3>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  placeholder="Ph. Code"
                  style={{ ...inputStyle, width: "30%" }}
                  value={newItem.code}
                  onChange={(e) =>
                    setNewItem({ ...newItem, code: e.target.value })
                  }
                />
                <input
                  placeholder="Pharmacy Name"
                  style={{ ...inputStyle, width: "70%" }}
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                />
              </div>
              <input
                placeholder="Assign to EmpCode (e.g. EMP001)"
                style={inputStyle}
                value={newItem.empCode}
                onChange={(e) =>
                  setNewItem({ ...newItem, empCode: e.target.value })
                }
              />
              <button
                onClick={() => handleAddMasterData("pharmacies")}
                style={actionBtnStyle}
              >
                Add Pharmacy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORTS TAB */}
      {activeTab === "reports" && (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "15px",
            }}
          >
            <h2 style={{ margin: 0 }}>
              {isAdmin ? "All Team Sales Report" : "My Sales Report"}
            </h2>

            {/* EXCEL EXPORT DATE RANGE BAR */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#f7fafc",
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "bold",
                  color: "#4a5568",
                }}
              >
                Export Excel:
              </span>
              <select
                style={{ padding: "5px", borderRadius: "4px" }}
                value={exportFilter.fromMonth}
                onChange={(e) =>
                  setExportFilter({
                    ...exportFilter,
                    fromMonth: e.target.value,
                  })
                }
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                style={{ padding: "5px", borderRadius: "4px" }}
                value={exportFilter.fromYear}
                onChange={(e) =>
                  setExportFilter({ ...exportFilter, fromYear: e.target.value })
                }
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                style={{ padding: "5px", borderRadius: "4px" }}
                value={exportFilter.toMonth}
                onChange={(e) =>
                  setExportFilter({ ...exportFilter, toMonth: e.target.value })
                }
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                style={{ padding: "5px", borderRadius: "4px" }}
                value={exportFilter.toYear}
                onChange={(e) =>
                  setExportFilter({ ...exportFilter, toYear: e.target.value })
                }
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                onClick={handleExportFilteredSalesToExcel}
                style={{
                  padding: "6px 12px",
                  background: "#38a169",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontWeight: "bold",
                }}
              >
                <Download size={16} /> Download
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f7fafc",
                    borderBottom: "2px solid #e2e8f0",
                  }}
                >
                  <th style={thStyle}>Date</th>
                  {isAdmin && <th style={thStyle}>Employee</th>}
                  <th style={thStyle}>Doctor</th>
                  <th style={thStyle}>Stockist / Pharmacy</th>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Sale Qty</th>
                  <th style={thStyle}>Discount</th>
                  <th style={thStyle}>Total Value</th>
                  {!isAdmin && <th style={thStyle}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    style={{ borderBottom: "1px solid #e2e8f0" }}
                  >
                    <td style={tdStyle}>
                      {sale.month} {sale.year}
                    </td>
                    {isAdmin && (
                      <td style={tdStyle}>
                        [{sale.employeeCode}] {sale.employeeName}
                      </td>
                    )}
                    <td style={tdStyle}>
                      <strong>{sale.doctorName}</strong>
                    </td>
                    <td style={tdStyle}>
                      Stk: {sale.stockistName} <br />
                      <span style={{ fontSize: "12px", color: "#718096" }}>
                        Ph: {sale.pharmacyName}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      [{sale.productCode}] {sale.productName} <br />
                      <span style={{ fontSize: "12px", color: "#718096" }}>
                        Batch: {sale.batchNo || "N/A"} | NRV: ₹{sale.nrv}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {sale.saleQty} <br />
                      <span style={{ fontSize: "12px", color: "#718096" }}>
                        (Free: {sale.freeQty})
                      </span>
                    </td>
                    <td style={tdStyle}>₹{sale.discount || 0}</td>
                    <td style={tdStyle}>
                      <strong>₹{sale.saleValue.toFixed(2)}</strong>
                    </td>
                    {!isAdmin && (
                      <td style={tdStyle}>
                        {appState?.canEditSales ? (
                          <button
                            onClick={() => handleStartEditSale(sale)}
                            style={{
                              padding: "5px 10px",
                              background: "#3182ce",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                            }}
                          >
                            <Edit size={14} /> Edit
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#a0aec0" }}>
                            Locked (Need Admin Approval)
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td
                      colSpan={isAdmin ? "8" : "9"}
                      style={{ padding: "20px", textAlign: "center" }}
                    >
                      No sales data found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable Styles
const tabStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 20px",
  background: active ? "#3182ce" : "#edf2f7",
  color: active ? "white" : "#4a5568",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "bold",
});
const cardStyle = {
  background: "white",
  padding: "20px",
  borderRadius: "8px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  border: "1px solid #e2e8f0",
};
const labelStyle = {
  display: "block",
  marginBottom: "5px",
  fontWeight: "bold",
  color: "#4a5568",
  fontSize: "14px",
};
const inputStyle = {
  width: "100%",
  padding: "8px",
  border: "1px solid #cbd5e0",
  borderRadius: "4px",
  marginBottom: "10px",
  boxSizing: "border-box",
};
const actionBtnStyle = {
  width: "100%",
  padding: "10px",
  background: "#2b6cb0",
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: "bold",
};
const listStyle = {
  marginTop: "15px",
  paddingLeft: "20px",
  fontSize: "14px",
  color: "#4a5568",
  maxHeight: "150px",
  overflowY: "auto",
};
const thStyle = { padding: "10px", fontWeight: "bold", color: "#4a5568" };
const tdStyle = { padding: "10px", color: "#2d3748" };
