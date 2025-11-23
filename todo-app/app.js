// Todo App - Main JavaScript File

class TodoApp {
  constructor() {
    // DOM Elements
    this.todoInput = document.getElementById('todoInput');
    this.addBtn = document.getElementById('addBtn');
    this.todoList = document.getElementById('todoList');
    this.emptyState = document.getElementById('emptyState');
    this.filterBtns = document.querySelectorAll('.filter-btn');
    this.clearCompletedBtn = document.getElementById('clearCompleted');
    this.totalCount = document.getElementById('totalCount');
    this.completedCount = document.getElementById('completedCount');
    
    // State
    this.todos = this.loadTodos();
    this.currentFilter = 'all';
    this.editingId = null;
    
    // Initialize
    this.init();
  }
  
  init() {
    // Event Listeners
    this.addBtn.addEventListener('click', () => this.addTodo());
    this.todoInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTodo();
    });
    
    this.filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
    });
    
    this.clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
    
    // Initial Render
    this.render();
  }
  
  // Add new todo
  addTodo() {
    const text = this.todoInput.value.trim();
    
    if (!text) {
      this.todoInput.focus();
      return;
    }
    
    const todo = {
      id: Date.now(),
      text: text,
      completed: false,
      createdAt: new Date().toISOString()
    };
    
    this.todos.push(todo);
    this.saveTodos();
    this.todoInput.value = '';
    this.todoInput.focus();
    this.render();
  }
  
  // Toggle todo completion
  toggleTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
      this.saveTodos();
      this.render();
    }
  }
  
  // Delete todo
  deleteTodo(id) {
    const todoElement = document.querySelector(`[data-id="${id}"]`);
    
    if (todoElement) {
      // Add removing animation
      todoElement.classList.add('removing');
      
      // Wait for animation to complete
      setTimeout(() => {
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveTodos();
        this.render();
      }, 300);
    }
  }
  
  // Start editing todo
  startEdit(id) {
    if (this.editingId !== null) return;
    
    this.editingId = id;
    this.render();
    
    // Focus the edit input
    const editInput = document.querySelector(`[data-edit-id="${id}"]`);
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }
  
  // Save edited todo
  saveEdit(id, newText) {
    const text = newText.trim();
    
    if (!text) {
      this.deleteTodo(id);
      return;
    }
    
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.text = text;
      this.saveTodos();
    }
    
    this.editingId = null;
    this.render();
  }
  
  // Cancel editing
  cancelEdit() {
    this.editingId = null;
    this.render();
  }
  
  // Set filter
  setFilter(filter) {
    this.currentFilter = filter;
    
    // Update active filter button
    this.filterBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    this.render();
  }
  
  // Clear completed todos
  clearCompleted() {
    const completedTodos = this.todos.filter(t => t.completed);
    
    if (completedTodos.length === 0) return;
    
    // Add removing animation to all completed items
    completedTodos.forEach(todo => {
      const todoElement = document.querySelector(`[data-id="${todo.id}"]`);
      if (todoElement) {
        todoElement.classList.add('removing');
      }
    });
    
    // Wait for animation to complete
    setTimeout(() => {
      this.todos = this.todos.filter(t => !t.completed);
      this.saveTodos();
      this.render();
    }, 300);
  }
  
  // Get filtered todos
  getFilteredTodos() {
    switch (this.currentFilter) {
      case 'active':
        return this.todos.filter(t => !t.completed);
      case 'completed':
        return this.todos.filter(t => t.completed);
      default:
        return this.todos;
    }
  }
  
  // Render todos
  render() {
    const filteredTodos = this.getFilteredTodos();
    
    // Clear list
    this.todoList.innerHTML = '';
    
    // Show/hide empty state
    if (filteredTodos.length === 0) {
      this.emptyState.style.display = 'block';
      this.todoList.appendChild(this.emptyState);
    } else {
      this.emptyState.style.display = 'none';
      
      // Render each todo
      filteredTodos.forEach(todo => {
        const li = this.createTodoElement(todo);
        this.todoList.appendChild(li);
      });
    }
    
    // Update stats
    this.updateStats();
  }
  
  // Create todo element
  createTodoElement(todo) {
    const li = document.createElement('li');
    li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
    li.setAttribute('data-id', todo.id);
    li.setAttribute('role', 'listitem');
    
    // Checkbox
    const checkbox = document.createElement('div');
    checkbox.className = 'todo-checkbox';
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('aria-checked', todo.completed);
    checkbox.setAttribute('tabindex', '0');
    checkbox.addEventListener('click', () => this.toggleTodo(todo.id));
    checkbox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleTodo(todo.id);
      }
    });
    
    // Text or Edit Input
    let textElement;
    if (this.editingId === todo.id) {
      textElement = document.createElement('input');
      textElement.type = 'text';
      textElement.className = 'edit-input';
      textElement.value = todo.text;
      textElement.setAttribute('data-edit-id', todo.id);
      
      textElement.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveEdit(todo.id, e.target.value);
        }
      });
      
      textElement.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.cancelEdit();
        }
      });
      
      textElement.addEventListener('blur', (e) => {
        this.saveEdit(todo.id, e.target.value);
      });
    } else {
      textElement = document.createElement('span');
      textElement.className = 'todo-text';
      textElement.textContent = todo.text;
      textElement.addEventListener('click', () => {
        if (!todo.completed) {
          this.startEdit(todo.id);
        }
      });
    }
    
    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.setAttribute('aria-label', '删除任务');
    deleteBtn.addEventListener('click', () => this.deleteTodo(todo.id));
    
    // Assemble
    li.appendChild(checkbox);
    li.appendChild(textElement);
    li.appendChild(deleteBtn);
    
    return li;
  }
  
  // Update statistics
  updateStats() {
    const total = this.todos.length;
    const completed = this.todos.filter(t => t.completed).length;
    
    this.totalCount.textContent = total;
    this.completedCount.textContent = completed;
    
    // Hide clear button if no completed todos
    this.clearCompletedBtn.style.display = completed > 0 ? 'block' : 'none';
  }
  
  // Save todos to localStorage
  saveTodos() {
    localStorage.setItem('todos', JSON.stringify(this.todos));
  }
  
  // Load todos from localStorage
  loadTodos() {
    const stored = localStorage.getItem('todos');
    return stored ? JSON.parse(stored) : [];
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new TodoApp();
});
